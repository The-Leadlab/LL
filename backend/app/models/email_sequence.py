"""
Email Sequence Models

Automated email campaigns with multi-step sequences.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text, JSON, Float
from sqlalchemy.orm import relationship
from app.models.base import Base


class EmailSequence(Base):
    """Email sequence/campaign"""
    __tablename__ = "email_sequences"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    organization_id = Column(Integer, ForeignKey("organizations.id"))

    is_active = Column(Boolean, default=True)
    steps = Column(JSON)  # [{step, delay_days, subject, body, template_id}]
    # Mailbox used by the outreach worker when sending sequence steps
    email_account_id = Column(Integer, ForeignKey("email_accounts.id"), nullable=True)
    # {timezone, send_window_start, send_window_end, weekdays_only, max_per_hour}
    settings = Column(JSON, nullable=True)

    # Stats
    total_enrolled = Column(Integer, default=0)
    total_completed = Column(Integer, default=0)
    total_replied = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"))

    enrollments = relationship("SequenceEnrollment", back_populates="sequence")


class SequenceEnrollment(Base):
    """Enrollment of a lead in a sequence"""
    __tablename__ = "sequence_enrollments"

    id = Column(Integer, primary_key=True)
    sequence_id = Column(Integer, ForeignKey("email_sequences.id"))
    lead_id = Column(Integer, ForeignKey("leads.id"))

    current_step = Column(Integer, default=0)
    status = Column(String(50), default="active")  # active, completed, paused, replied

    enrolled_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    paused_at = Column(DateTime, nullable=True)

    sequence = relationship("EmailSequence", back_populates="enrollments")
    steps = relationship("SequenceStep", back_populates="enrollment")


class SequenceStep(Base):
    """Individual step execution"""
    __tablename__ = "sequence_steps"

    id = Column(Integer, primary_key=True)
    enrollment_id = Column(Integer, ForeignKey("sequence_enrollments.id"))
    step_number = Column(Integer)

    scheduled_at = Column(DateTime)
    sent_at = Column(DateTime)
    opened_at = Column(DateTime)
    clicked_at = Column(DateTime)
    replied_at = Column(DateTime)

    status = Column(String(50), default="pending")

    enrollment = relationship("SequenceEnrollment", back_populates="steps")
