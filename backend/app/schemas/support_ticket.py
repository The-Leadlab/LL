from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class SupportTicketCreate(BaseModel):
    reporter_name: str = Field(..., min_length=1, max_length=200)
    reporter_email: EmailStr
    project_name: str = Field(..., min_length=1, max_length=255)
    subject: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1, max_length=10000)
    priority: str = Field(default="normal", max_length=40)


class SupportTicketUpdate(BaseModel):
    status: Optional[str] = Field(default=None, max_length=40)
    priority: Optional[str] = Field(default=None, max_length=40)


class SupportTicketOut(BaseModel):
    id: int
    reporter_name: str
    reporter_email: str
    project_name: str
    subject: str
    description: str
    status: str
    priority: str
    organization_id: Optional[int] = None
    reporter_user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SupportTicketList(BaseModel):
    items: List[SupportTicketOut]
    total: int
