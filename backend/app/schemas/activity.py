from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.models.activity import ActivityType

class ActivityBase(BaseModel):
    type: ActivityType
    description: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration: int = 0
    user_id: Optional[int] = None
    organization_id: Optional[int] = None
    lead_id: Optional[int] = None
    deal_id: Optional[int] = None

class ActivityCreate(ActivityBase):
    pass

class ActivityUpdate(ActivityBase):
    type: Optional[ActivityType] = None
    user_id: Optional[int] = None
    organization_id: Optional[int] = None
    lead_id: Optional[int] = None

class Activity(ActivityBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ActivityList(BaseModel):
    items: List[Activity]
    total: int