from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, LargeBinary, BigInteger
from app.models.base import Base


class TaskAttachment(Base):
    """Task file attachments stored in the database (survives Render ephemeral disks)."""

    __tablename__ = "task_attachments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False, unique=True, index=True)
    content_type = Column(String(255), nullable=True)
    size_bytes = Column(BigInteger, nullable=False, default=0)
    blob = Column(LargeBinary, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
