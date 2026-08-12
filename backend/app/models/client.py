"""Client containers for organizing leads within an organization."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_clients_org_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    is_archived = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="clients")
    leads = relationship("Lead", back_populates="client")

    def __repr__(self) -> str:
        return f"<Client {self.name} org={self.organization_id}>"
