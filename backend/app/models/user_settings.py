from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.models.base import Base

class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    theme_preference = Column(JSON)  # Store UI theme preferences
    notification_preferences = Column(JSON)  # Store notification settings
    dashboard_layout = Column(JSON)  # Store dashboard widget layout
    timezone = Column(String(50))
    language = Column(String(10), default="en")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="settings")

    def __repr__(self):
        return f"<UserSettings {self.user_id}>"

    @property
    def theme(self) -> Dict[str, Any]:
        """Get theme preferences with defaults"""
        default_theme = {
            "mode": "light",
            "colorPrimary": "#1890ff",
            "colorSecondary": "#52c41a",
            "borderRadius": 6,
            "fontSize": "medium"
        }
        if not self.theme_preference:
            return default_theme
        return {**default_theme, **self.theme_preference}

    @property
    def notifications(self) -> Dict[str, Any]:
        """Get notification preferences with defaults"""
        default_notifications = {
            "email": True,
            "push": True,
            "leadAssigned": True,
            "dealUpdated": True,
            "taskDue": True,
            "taskAssigned": True,
            "meetingReminder": True,
            "systemUpdates": False,
            "messages": True,
            "mentions": True,
        }
        if not self.notification_preferences:
            return default_notifications
        return {**default_notifications, **self.notification_preferences}

    @property
    def dashboard(self) -> Dict[str, Any]:
        """Get dashboard layout with defaults"""
        default_layout = {
            "widgets": [
                {"id": "tasks", "position": 0, "visible": True},
                {"id": "leads", "position": 1, "visible": True},
                {"id": "deals", "position": 2, "visible": True},
                {"id": "activities", "position": 3, "visible": True},
                {"id": "analytics", "position": 4, "visible": True}
            ],
            "layout": "grid"
        }
        if not self.dashboard_layout:
            return default_layout
        return {**default_layout, **self.dashboard_layout}
