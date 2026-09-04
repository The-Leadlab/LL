"""Outreach platform models: connections, scenarios, runs, templates."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, JSON, Boolean
from sqlalchemy.orm import relationship
from app.models.base import Base


class OutreachConnection(Base):
    __tablename__ = "outreach_connections"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(40), nullable=False, index=True)
    # gmail|smtp|google_sheets|google_docs|webhook|ai
    display_name = Column(String(255), nullable=False)
    config = Column(JSON, nullable=True)
    encrypted_credentials = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="active")
    last_error = Column(Text, nullable=True)
    public_token = Column(String(64), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)


class OutreachScenario(Base):
    __tablename__ = "outreach_scenarios"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft", index=True)
    flow_definition = Column(JSON, nullable=False, default=dict)
    schedule_config = Column(JSON, nullable=True)
    settings = Column(JSON, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)

    runs = relationship("OutreachRun", back_populates="scenario", cascade="all, delete-orphan")


class OutreachRun(Base):
    __tablename__ = "outreach_runs"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("outreach_scenarios.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    trigger_type = Column(String(40), nullable=False, default="manual")
    status = Column(String(20), nullable=False, default="running", index=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    stats = Column(JSON, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    scenario = relationship("OutreachScenario", back_populates="runs")
    steps = relationship("OutreachRunStep", back_populates="run", cascade="all, delete-orphan")


class OutreachRunStep(Base):
    __tablename__ = "outreach_run_steps"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("outreach_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    node_id = Column(String(64), nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(20), nullable=False, default="pending", index=True)
    scheduled_at = Column(DateTime, nullable=False, index=True)
    executed_at = Column(DateTime, nullable=True)
    input = Column(JSON, nullable=True)
    output = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    idempotency_key = Column(String(128), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    run = relationship("OutreachRun", back_populates="steps")


class OutreachTemplate(Base):
    __tablename__ = "outreach_templates"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    format = Column(String(10), nullable=False, default="text")
    ab_subjects = Column(JSON, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
