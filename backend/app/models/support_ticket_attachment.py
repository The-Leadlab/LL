"""Attachments for public/authenticated issue reports (DB-backed for Render)."""
from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, LargeBinary, String

from app.models.base import Base


class SupportTicketAttachment(Base):
    __tablename__ = "support_ticket_attachments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(
        Integer, ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False, unique=True, index=True)
    content_type = Column(String(255), nullable=True)
    size_bytes = Column(BigInteger, nullable=False, default=0)
    blob = Column(LargeBinary, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
