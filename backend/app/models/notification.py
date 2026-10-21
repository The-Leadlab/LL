from sqlalchemy import Boolean, Integer, String, Text, DateTime, ForeignKey, Enum, Index
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.models.base import Base
from datetime import datetime
from typing import Optional, TYPE_CHECKING
import enum

if TYPE_CHECKING:
    from app.models.user import User

class NotificationType(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    SUCCESS = "success"
    ERROR = "error"

class NotificationPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_read_created", "user_id", "is_read", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    type: Mapped[Optional[NotificationType]] = mapped_column(Enum(NotificationType, native_enum=False, values_callable=lambda x: [e.value for e in x]), default=NotificationType.INFO, nullable=True)
    priority: Mapped[Optional[NotificationPriority]] = mapped_column(Enum(NotificationPriority, native_enum=False, values_callable=lambda x: [e.value for e in x]), default=NotificationPriority.MEDIUM, nullable=True)
    action_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<Notification {self.title[:30]}>"
