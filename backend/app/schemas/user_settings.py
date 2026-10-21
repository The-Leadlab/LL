from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class ThemePreference(BaseModel):
    mode: str = Field("light", description="Theme mode: light or dark")
    colorPrimary: str = Field("#1890ff", description="Primary color")
    colorSecondary: str = Field("#52c41a", description="Secondary color")
    borderRadius: int = Field(6, description="Border radius in pixels")
    fontSize: str = Field("medium", description="Font size: small, medium, or large")


class NotificationPreferences(BaseModel):
    email: bool = Field(True, description="Email notifications")
    push: bool = Field(True, description="Push notifications")
    leadAssigned: bool = Field(True, description="Lead assignment notifications")
    dealUpdated: bool = Field(True, description="Deal update notifications")
    taskDue: bool = Field(True, description="Task due notifications")
    taskAssigned: bool = Field(True, description="Task assignment notifications")
    meetingReminder: bool = Field(True, description="Meeting reminder notifications")
    systemUpdates: bool = Field(False, description="System update notifications")
    messages: bool = Field(True, description="Direct message notifications")
    mentions: bool = Field(True, description="@mention notifications")


class DashboardWidget(BaseModel):
    id: str = Field(..., description="Widget identifier")
    position: int = Field(..., description="Widget position")
    visible: bool = Field(True, description="Widget visibility")


class DashboardLayout(BaseModel):
    widgets: List[DashboardWidget] = Field(..., description="Dashboard widgets")
    layout: str = Field("grid", description="Layout type: grid or list")


class UserSettingsBase(BaseModel):
    theme_preference: Optional[ThemePreference] = None
    notification_preferences: Optional[NotificationPreferences] = None
    dashboard_layout: Optional[DashboardLayout] = None
    timezone: Optional[str] = Field(None, description="User timezone")
    language: str = Field("en", description="User interface language")


class UserSettingsCreate(UserSettingsBase):
    user_id: int


class UserSettingsUpdate(BaseModel):
    theme_preference: Optional[Dict[str, Any]] = None
    notification_preferences: Optional[Dict[str, Any]] = None
    dashboard_layout: Optional[Dict[str, Any]] = None
    timezone: Optional[str] = None
    language: Optional[str] = None


class UserSettings(UserSettingsBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# API Response Models
class UserSettingsResponse(BaseModel):
    success: bool = True
    message: str = "Operation successful"
    data: Optional[UserSettings] = None
