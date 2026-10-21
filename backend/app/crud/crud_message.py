from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, func, case
from app.crud.base import CRUDBase
from app.models.message import Message
from app.models.user import User
from app.schemas.message import MessageCreate, MessageUpdate
from app.core.encryption import encrypt_message_content, decrypt_message_content
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class CRUDMessage(CRUDBase[Message, MessageCreate, MessageUpdate]):
    
    def create_message(
        self, 
        db: Session, 
        *, 
        message_in: MessageCreate, 
        sender_id: int,
        organization_id: int
    ) -> Message:
        """Create a new message with encrypted content"""
        # Encrypt message content before storing
        original_content = message_in.content
        logger.info(f"Encrypting message: '{original_content}'")
        
        encrypted_content = encrypt_message_content(message_in.content)
        logger.info(f"Encrypted content: '{encrypted_content}' (length: {len(encrypted_content)})")
        
        db_obj = Message(
            content=encrypted_content,
            sender_id=sender_id,
            receiver_id=message_in.receiver_id,
            organization_id=organization_id
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        
        logger.info(f"Message saved to DB with content: '{db_obj.content}'")
        return db_obj
    
    def get_conversation(
        self,
        db: Session,
        *,
        user1_id: int,
        user2_id: int,
        organization_id: int,
        skip: int = 0,
        limit: int = 50
    ) -> List[Message]:
        """Get conversation between two users"""
        return (
            db.query(Message)
            .filter(
                and_(
                    Message.organization_id == organization_id,
                    or_(
                        and_(Message.sender_id == user1_id, Message.receiver_id == user2_id),
                        and_(Message.sender_id == user2_id, Message.receiver_id == user1_id)
                    )
                )
            )
            .order_by(Message.created_at)
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_conversations_for_user(
        self,
        db: Session,
        *,
        user_id: int,
        organization_id: int
    ) -> List[tuple]:
        """Get conversation partners with last message + unread (no per-partner N+1)."""
        sent_to = (
            db.query(Message.receiver_id)
            .filter(
                and_(
                    Message.sender_id == user_id,
                    Message.organization_id == organization_id,
                )
            )
            .distinct()
        )
        received_from = (
            db.query(Message.sender_id)
            .filter(
                and_(
                    Message.receiver_id == user_id,
                    Message.organization_id == organization_id,
                )
            )
            .distinct()
        )
        partner_ids = [pid[0] for pid in sent_to.union(received_from).all()]
        if not partner_ids:
            return []

        partners = (
            db.query(User)
            .filter(
                and_(
                    User.id.in_(partner_ids),
                    User.organization_id == organization_id,
                    User.is_active == True,  # noqa: E712
                )
            )
            .all()
        )
        if not partners:
            return []
        active_partner_ids = [p.id for p in partners]

        partner_expr = case(
            (Message.sender_id == user_id, Message.receiver_id),
            else_=Message.sender_id,
        )
        last_rows = (
            db.query(
                partner_expr.label("partner_id"),
                func.max(Message.id).label("max_id"),
            )
            .filter(
                Message.organization_id == organization_id,
                or_(
                    and_(
                        Message.sender_id == user_id,
                        Message.receiver_id.in_(active_partner_ids),
                    ),
                    and_(
                        Message.receiver_id == user_id,
                        Message.sender_id.in_(active_partner_ids),
                    ),
                ),
            )
            .group_by(partner_expr)
            .all()
        )
        max_ids = [row.max_id for row in last_rows if row.max_id]
        last_by_id = {}
        if max_ids:
            for msg in db.query(Message).filter(Message.id.in_(max_ids)).all():
                last_by_id[msg.id] = msg
        last_by_partner = {
            int(row.partner_id): last_by_id.get(row.max_id) for row in last_rows
        }

        unread_rows = (
            db.query(Message.sender_id, func.count(Message.id))
            .filter(
                Message.receiver_id == user_id,
                Message.organization_id == organization_id,
                Message.is_read == False,  # noqa: E712
                Message.sender_id.in_(active_partner_ids),
            )
            .group_by(Message.sender_id)
            .all()
        )
        unread_map = {int(sid): int(cnt) for sid, cnt in unread_rows}

        conversations = [
            (partner, last_by_partner.get(partner.id), unread_map.get(partner.id, 0))
            for partner in partners
        ]
        conversations.sort(
            key=lambda x: x[1].created_at if x[1] else datetime.min,
            reverse=True,
        )
        return conversations
    
    def mark_as_read(
        self,
        db: Session,
        *,
        user_id: int,
        partner_id: int,
        organization_id: int
    ) -> int:
        """Mark all messages from partner as read"""
        count = (
            db.query(Message)
            .filter(
                and_(
                    Message.sender_id == partner_id,
                    Message.receiver_id == user_id,
                    Message.organization_id == organization_id,
                    Message.is_read == False
                )
            )
            .update({"is_read": True, "updated_at": datetime.utcnow()})
        )
        db.commit()
        return count
    
    def get_organization_users(
        self,
        db: Session,
        *,
        organization_id: int,
        current_user_id: int
    ) -> List[User]:
        """Get all active users in the organization except current user"""
        return (
            db.query(User)
            .filter(
                and_(
                    User.organization_id == organization_id,
                    User.id != current_user_id,
                    User.is_active == True
                )
            )
            .order_by(User.first_name, User.last_name)
            .all()
        )

message = CRUDMessage(Message) 