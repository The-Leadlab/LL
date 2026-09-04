"""
Queued cold-outreach / campaign email jobs.

Processed by the outreach worker (cron tick), not by sleeping in HTTP requests.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Float, JSON
from sqlalchemy.orm import relationship
from app.models.base import Base


class OutreachJob(Base):
    __tablename__ = "outreach_jobs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("email_accounts.id"), nullable=False, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)

    batch_id = Column(String(64), nullable=True, index=True)
    subject = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    format = Column(String(10), nullable=False, default="text")  # text | html

    scheduled_at = Column(DateTime, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending", index=True)
    # pending | processing | sent | failed | skipped | cancelled | deferred

    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    idempotency_key = Column(String(128), nullable=False, unique=True, index=True)

    # Optional send-window settings snapshot
    settings = Column(JSON, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)

    lead = relationship("Lead", foreign_keys=[lead_id])
    account = relationship("EmailAccount", foreign_keys=[account_id])
