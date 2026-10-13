from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from app.models.task import TaskPriority, TaskStatus

# Lead information schema
class LeadInfo(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None

    class Config:
        from_attributes = True

# User information schema
class UserInfo(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    job_title: Optional[str] = None

    class Config:
        from_attributes = True

# Task Base Schema
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING
    lead_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    organization_id: int

# Properties to receive via API on creation
class TaskCreate(TaskBase):
    organization_id: int = Field(..., description="Organization ID is required for task creation")
    
    class Config:
        json_schema_extra = {
            "example": {
                "title": "Complete client meeting",
                "description": "Discuss project requirements with client",
                "due_date": "2023-12-31T14:00:00Z",
                "priority": "MEDIUM",
                "status": "PENDING",
                "lead_id": 1,
                "assigned_to_id": 2,
                "organization_id": 1
            }
        }

# Properties to receive via API on update
class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    lead_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    completed_at: Optional[datetime] = None

# Properties stored in DB
class TaskInDB(TaskBase):
    id: int
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Properties to return via API
class Task(TaskInDB):
    lead: Optional[LeadInfo] = None
    assigned_to: Optional[UserInfo] = None

    class Config:
        from_attributes = True

# Properties for Task list
class TaskList(BaseModel):
    items: List[Task]
    total: int

    class Config:
        from_attributes = True
