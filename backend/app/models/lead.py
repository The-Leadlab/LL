from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean, TypeDecorator
from sqlalchemy.orm import relationship, composite
from app.models.base import Base
from app.models.associations import lead_tags
from sqlalchemy.ext.hybrid import hybrid_property

class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    email = Column(String(255), index=True, nullable=True)
    job_title = Column(String(255), nullable=True)
    company = Column(String(200), index=True, nullable=True)
    linkedin = Column(String(500), nullable=True)
    location = Column(String(200), nullable=True)
    country = Column(String(100), index=True, nullable=True)
    website = Column(String(500), nullable=True)
    unique_lead_id = Column(String(100), index=True, nullable=True)
    est_wealth_experience = Column(String(255), nullable=True)  # Added for wealth experience data
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)
    stage_id = Column(Integer, ForeignKey("lead_stages.id"), nullable=False)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=True)
    telephone = Column("phone", String(50), nullable=True)  # Database column is 'phone' not 'telephone'
    mobile = Column(String(50), nullable=True)
    sector = Column(String(200), index=True, nullable=True)
    time_in_current_role = Column(String(100), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    lab_comments = Column(Text, nullable=True)
    client_comments = Column(Text, nullable=True)
    _psychometrics = Column("psychometrics", JSON, nullable=True)
    wpi = Column(String(50), index=True, nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
    # visible = Column(Boolean, nullable=False, default=True)  # Column doesn't exist in database
    source = Column(String(100), nullable=True)
    # email_guidelines = Column(Text, nullable=True)  # Column doesn't exist in database
    sales_intelligence = Column(JSON, nullable=True)  # AI sales intelligence data

    # Properties for backward compatibility
    @property
    def visible(self) -> bool:
        """Visible property - column doesn't exist, always return True"""
        return True
    
    @property
    def email_guidelines(self):
        """Email guidelines property - column doesn't exist"""
        return None

    # Hybrid property for psychometrics
    @hybrid_property
    def psychometrics(self):
        """Get the psychometrics value, ensuring it's always a dict."""
        import json
        # If None, return empty dict
        if self._psychometrics is None:
            return {}
        # If empty string, return empty dict
        if self._psychometrics == "":
            return {}
        # If it's a string (like '{}'), try to parse it as JSON
        if isinstance(self._psychometrics, str):
            try:
                parsed = json.loads(self._psychometrics)
                return parsed if isinstance(parsed, dict) else {}
            except (json.JSONDecodeError, ValueError):
                return {}
        # If it's already a dict, return it
        if isinstance(self._psychometrics, dict):
            return self._psychometrics
        # Otherwise return empty dict
        return {}

    @psychometrics.setter
    def psychometrics(self, value):
        """Set the psychometrics value, ensuring it's always a dict."""
        # If None or empty string, save as empty dict
        if value is None or value == "":
            self._psychometrics = {}
        else:
            self._psychometrics = value

    # Relationships
    organization = relationship("Organization", back_populates="leads")
    client = relationship("Client", back_populates="leads")
    user = relationship("User", back_populates="leads", foreign_keys=[user_id])
    creator = relationship("User", back_populates="created_leads", foreign_keys=[created_by])
    stage = relationship("LeadStage", back_populates="leads")
    notes = relationship("Note", back_populates="lead", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="lead", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="lead", cascade="all, delete-orphan")
    communications = relationship("Communication", back_populates="lead")
    deals = relationship("Deal", back_populates="lead")
    tasks = relationship("Task", back_populates="lead")
    opportunities = relationship("Opportunity", back_populates="lead")
    information_requests = relationship("InformationRequest", back_populates="lead", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary=lead_tags, back_populates="leads")
    ai_insights = relationship("AIInsight", back_populates="lead", cascade="all, delete-orphan")
    emails = relationship("Email", back_populates="lead", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        # Ensure tags is always initialized as an empty list
        if 'tags' not in kwargs:
            kwargs['tags'] = []
        super().__init__(**kwargs)

    @property
    def full_name(self) -> str:
        """Get full name of the lead."""
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def client_name(self) -> Optional[str]:
        """Client display name for API responses."""
        if self.client is not None:
            return self.client.name
        return None

    def __repr__(self):
        return f"<Lead {self.full_name}>"

    def to_dict(self) -> dict:
        """Convert lead object to dictionary."""
        try:
            return {
                "id": self.id,
                "first_name": self.first_name or "",
                "last_name": self.last_name or "",
                "email": self.email or "",
                "job_title": self.job_title or "",
                "company": self.company or "",
                "linkedin": self.linkedin or "",
                "location": self.location or "",
                "country": self.country or "",
                "website": self.website or "",
                "unique_lead_id": self.unique_lead_id or "",
                "est_wealth_experience": self.est_wealth_experience or "",
                "user_id": self.user_id,
                "organization_id": self.organization_id,
                "client_id": self.client_id,
                "client_name": self.client.name if self.client else None,
                "stage_id": self.stage_id,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "updated_at": self.updated_at.isoformat() if self.updated_at else None,
                "telephone": self.telephone or "",
                "mobile": self.mobile or "",
                "sector": self.sector or "",
                "time_in_current_role": self.time_in_current_role or "",
                "created_by": self.created_by,
                "lab_comments": self.lab_comments or "",
                "client_comments": self.client_comments or "",
                "psychometrics": self.psychometrics,
                "wpi": self.wpi or "",
                "is_deleted": self.is_deleted,
                "visible": self.visible,
                "source": self.source or "",
                "full_name": self.full_name,
                "stage": {
                    "id": self.stage.id,
                    "name": self.stage.name
                } if self.stage else None,
                "user": {
                    "id": self.user.id,
                    "email": self.user.email,
                    "first_name": self.user.first_name,
                    "last_name": self.user.last_name
                } if self.user else None,
                "creator": {
                    "id": self.creator.id,
                    "email": self.creator.email,
                    "first_name": self.creator.first_name,
                    "last_name": self.creator.last_name
                } if self.creator else None,
                "tags": [
                    {
                        "id": tag.id,
                        "name": tag.name,
                        "organization_id": tag.organization_id
                    } for tag in self.tags
                ] if self.tags else [],
                "email_guidelines": self.email_guidelines or "",
                "sales_intelligence": self.sales_intelligence or {}
            }
        except Exception as e:
            print(f"Error in to_dict: {str(e)}")
            return {}