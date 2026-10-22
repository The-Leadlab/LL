from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_, exists
from fastapi import HTTPException

from app.models.client import Client
from app.models.lead import Lead
from app.models.user import User
from app.models.associations import client_assignees
from app.schemas.client import ClientCreate, ClientUpdate


GENERAL_NAME = "General"


class CRUDClient:
    def get(self, db: Session, id: int) -> Optional[Client]:
        return db.query(Client).filter(Client.id == id).first()

    def get_for_org(self, db: Session, *, id: int, organization_id: int) -> Optional[Client]:
        return (
            db.query(Client)
            .filter(Client.id == id, Client.organization_id == organization_id)
            .first()
        )

    def get_default(self, db: Session, *, organization_id: int) -> Optional[Client]:
        return (
            db.query(Client)
            .filter(
                Client.organization_id == organization_id,
                Client.is_default == True,  # noqa: E712
            )
            .first()
        )

    def ensure_general(self, db: Session, *, organization_id: int) -> Client:
        """Return the org's General client, creating it if missing."""
        existing = self.get_default(db, organization_id=organization_id)
        if existing:
            return existing

        # Prefer existing row named General (e.g. after partial seed)
        named = (
            db.query(Client)
            .filter(
                Client.organization_id == organization_id,
                Client.name == GENERAL_NAME,
            )
            .first()
        )
        if named:
            named.is_default = True
            named.is_archived = False
            named.updated_at = datetime.utcnow()
            db.add(named)
            db.commit()
            db.refresh(named)
            return named

        client = Client(
            organization_id=organization_id,
            name=GENERAL_NAME,
            is_default=True,
            is_archived=False,
            created_at=datetime.utcnow(),
        )
        db.add(client)
        db.commit()
        db.refresh(client)
        return client

    def list_for_org(
        self,
        db: Session,
        *,
        organization_id: int,
        include_archived: bool = False,
        viewer_user_id: Optional[int] = None,
        viewer_is_admin: bool = False,
    ) -> List[Client]:
        """
        List clients for an org.

        Admins see every list. Members see General, shared lists (no assignees),
        lists where they are an assignee (join or legacy singular), and lists they created.
        """
        self.ensure_general(db, organization_id=organization_id)
        q = db.query(Client).filter(Client.organization_id == organization_id)
        if not include_archived:
            q = q.filter(Client.is_archived == False)  # noqa: E712
        if not viewer_is_admin and viewer_user_id is not None:
            is_assignee = exists().where(
                and_(
                    client_assignees.c.client_id == Client.id,
                    client_assignees.c.user_id == viewer_user_id,
                )
            )
            has_any_assignee = exists().where(
                client_assignees.c.client_id == Client.id
            )
            # Shared = no join rows AND legacy assigned_user_id is null
            is_shared = and_(
                Client.assigned_user_id.is_(None),
                ~has_any_assignee,
            )
            q = q.filter(
                or_(
                    Client.is_default == True,  # noqa: E712
                    is_shared,
                    Client.assigned_user_id == viewer_user_id,
                    is_assignee,
                    Client.created_by == viewer_user_id,
                )
            )
        return q.order_by(Client.is_default.desc(), Client.name.asc()).all()

    def lead_counts_by_client(
        self, db: Session, *, organization_id: int
    ) -> dict[int, int]:
        rows = (
            db.query(Lead.client_id, func.count(Lead.id))
            .filter(
                Lead.organization_id == organization_id,
                Lead.is_deleted == False,  # noqa: E712
                Lead.client_id.isnot(None),
            )
            .group_by(Lead.client_id)
            .all()
        )
        return {cid: int(cnt) for cid, cnt in rows if cid is not None}

    def check_name_conflict(
        self,
        db: Session,
        *,
        organization_id: int,
        name: str,
        exclude_id: Optional[int] = None,
    ) -> Optional[Client]:
        q = db.query(Client).filter(
            and_(
                Client.organization_id == organization_id,
                Client.name == name,
            )
        )
        if exclude_id is not None:
            q = q.filter(Client.id != exclude_id)
        return q.first()

    def create(
        self,
        db: Session,
        *,
        organization_id: int,
        obj_in: ClientCreate,
        created_by: Optional[int] = None,
        assigned_user_id: Optional[int] = None,
    ) -> Client:
        name = (obj_in.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Client name cannot be empty")
        if name.lower() == GENERAL_NAME.lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot create another client named General; use the default General client",
            )
        if self.check_name_conflict(db, organization_id=organization_id, name=name):
            raise HTTPException(
                status_code=400,
                detail=f"Client '{name}' already exists in your organization",
            )
        # New lists belong to the creator by default (admin can reassign / share)
        owner_id = assigned_user_id if assigned_user_id is not None else created_by
        client = Client(
            organization_id=organization_id,
            name=name,
            is_default=False,
            is_archived=False,
            created_by=created_by,
            assigned_user_id=owner_id,
            created_at=datetime.utcnow(),
        )
        db.add(client)
        db.flush()
        if owner_id is not None:
            db.execute(
                client_assignees.insert().values(
                    client_id=client.id,
                    user_id=owner_id,
                )
            )
        db.commit()
        db.refresh(client)
        return client

    def assign(
        self,
        db: Session,
        *,
        db_obj: Client,
        assigned_user_id: Optional[int],
    ) -> Client:
        """Legacy singular assign — wraps assign_many."""
        ids = [] if assigned_user_id is None else [assigned_user_id]
        return self.assign_many(db, db_obj=db_obj, assigned_user_ids=ids)

    def assign_many(
        self,
        db: Session,
        *,
        db_obj: Client,
        assigned_user_ids: List[int],
    ) -> Client:
        """
        Set visibility assignees for a client list.

        Empty list = shared with the whole organization.
        Non-empty = only those members (+ admins + creator) can see the list.
        """
        if db_obj.is_default:
            raise HTTPException(
                status_code=400,
                detail="The General client cannot be assigned to specific members",
            )
        # Deduplicate while preserving order
        seen = set()
        unique_ids: List[int] = []
        for uid in assigned_user_ids:
            if uid is None or uid in seen:
                continue
            seen.add(uid)
            unique_ids.append(int(uid))

        if unique_ids:
            members = (
                db.query(User)
                .filter(
                    User.id.in_(unique_ids),
                    User.organization_id == db_obj.organization_id,
                    User.is_active == True,  # noqa: E712
                )
                .all()
            )
            found = {m.id for m in members}
            missing = [uid for uid in unique_ids if uid not in found]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail="Assignees must be active members of your organization",
                )

        db.execute(
            client_assignees.delete().where(
                client_assignees.c.client_id == db_obj.id
            )
        )
        for uid in unique_ids:
            db.execute(
                client_assignees.insert().values(
                    client_id=db_obj.id,
                    user_id=uid,
                )
            )
        # Keep legacy column: first assignee, or NULL when shared
        db_obj.assigned_user_id = unique_ids[0] if unique_ids else None
        db_obj.updated_at = datetime.utcnow()
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def rename(
        self, db: Session, *, db_obj: Client, obj_in: ClientUpdate
    ) -> Client:
        if db_obj.is_default:
            raise HTTPException(
                status_code=400,
                detail="The General client cannot be renamed",
            )
        if obj_in.name is None:
            return db_obj
        name = obj_in.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Client name cannot be empty")
        if name.lower() == GENERAL_NAME.lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot rename a client to General",
            )
        if self.check_name_conflict(
            db,
            organization_id=db_obj.organization_id,
            name=name,
            exclude_id=db_obj.id,
        ):
            raise HTTPException(
                status_code=400,
                detail=f"Client '{name}' already exists in your organization",
            )
        db_obj.name = name
        db_obj.updated_at = datetime.utcnow()
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def archive(self, db: Session, *, db_obj: Client) -> Client:
        if db_obj.is_default:
            raise HTTPException(
                status_code=400,
                detail="The General client cannot be archived",
            )
        db_obj.is_archived = True
        db_obj.updated_at = datetime.utcnow()
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def restore(self, db: Session, *, db_obj: Client) -> Client:
        # If restoring would collide with an active same-name client, block
        conflict = (
            db.query(Client)
            .filter(
                Client.organization_id == db_obj.organization_id,
                Client.name == db_obj.name,
                Client.id != db_obj.id,
                Client.is_archived == False,  # noqa: E712
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=400,
                detail=f"An active client named '{db_obj.name}' already exists; rename before restoring",
            )
        db_obj.is_archived = False
        db_obj.updated_at = datetime.utcnow()
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def delete_with_leads(self, db: Session, *, db_obj: Client) -> dict:
        """
        Soft-delete all leads on this client, then permanently remove the client.
        General/default client cannot be deleted.
        """
        if db_obj.is_default:
            raise HTTPException(
                status_code=400,
                detail="The General client cannot be deleted",
            )
        now = datetime.utcnow()
        client_id = db_obj.id
        client_name = db_obj.name
        deleted_leads = (
            db.query(Lead)
            .filter(
                Lead.client_id == client_id,
                Lead.is_deleted == False,  # noqa: E712
            )
            .update(
                {
                    Lead.is_deleted: True,
                    Lead.updated_at: now,
                    # Detach so the client row can be removed without FK issues
                    Lead.client_id: None,
                },
                synchronize_session=False,
            )
        )
        # Also detach already-soft-deleted leads still pointing at this client
        db.query(Lead).filter(Lead.client_id == client_id).update(
            {Lead.client_id: None, Lead.updated_at: now},
            synchronize_session=False,
        )
        db.delete(db_obj)
        db.commit()
        return {
            "client_id": client_id,
            "client_name": client_name,
            "deleted_leads": int(deleted_leads or 0),
        }

    def get_by_name(
        self, db: Session, *, organization_id: int, name: str
    ) -> Optional[Client]:
        return (
            db.query(Client)
            .filter(
                Client.organization_id == organization_id,
                func.lower(Client.name) == name.strip().lower(),
            )
            .first()
        )


client = CRUDClient()
