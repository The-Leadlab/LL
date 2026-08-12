from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, LargeBinary
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin

class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    website = Column(String(255), nullable=True)
    is_active = Column(Boolean(), nullable=True)
    logo_filename = Column(String(255), nullable=True)
    logo_content_type = Column(String(50), nullable=True)
    logo_path = Column(String(255), nullable=True)

    # Relationships
    users = relationship("User", back_populates="organization")
    roles = relationship("Role", back_populates="organization")
    leads = relationship("Lead", back_populates="organization")
    tasks = relationship("Task", back_populates="organization")
    notes = relationship("Note", back_populates="organization")
    events = relationship("Event", back_populates="organization")
    deals = relationship("Deal", back_populates="organization")
    tags = relationship("Tag", back_populates="organization")
    clients = relationship("Client", back_populates="organization", cascade="all, delete-orphan")
    communications = relationship("Communication", back_populates="organization")
    opportunities = relationship("Opportunity", back_populates="organization")
    activities = relationship("Activity", back_populates="organization")
    files = relationship("File", back_populates="organization")
    # reports = relationship("Report", back_populates="organization")
    settings = relationship("OrganizationSettings", back_populates="organization", uselist=False)
    email_templates = relationship("EmailTemplate", back_populates="organization", cascade="all, delete-orphan")
    email_logs = relationship("EmailLog", back_populates="organization", cascade="all, delete-orphan")
    email_accounts = relationship("EmailAccount", back_populates="organization", cascade="all, delete-orphan")
    emails = relationship("Email", back_populates="organization", cascade="all, delete-orphan")
    lead_stages = relationship("LeadStage", back_populates="organization", cascade="all, delete-orphan")
    api_tokens = relationship("APIToken", back_populates="organization", cascade="all, delete-orphan")  
    custom_fields = relationship("CustomFieldDefinition", back_populates="organization", cascade="all, delete-orphan")
    custom_field_values = relationship("CustomFieldValue", back_populates="organization", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="organization", cascade="all, delete-orphan")
    # team_invitations = relationship("TeamInvitation", back_populates="organization", cascade="all, delete-orphan")
    territories = relationship("Territory", back_populates="organization", cascade="all, delete-orphan")
    workflows = relationship("Workflow", back_populates="organization", cascade="all, delete-orphan")
    dashboards = relationship("Dashboard", back_populates="organization", cascade="all, delete-orphan")
    forecast_periods = relationship("ForecastPeriod", back_populates="organization", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Organization {self.name}>"
