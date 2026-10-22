from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ClientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)


class ClientAssign(BaseModel):
    """
    Admin-only: set who can see a client list.

    Prefer `assigned_user_ids` (multi). Empty list / omitted with null singular = shared with org.
    Legacy `assigned_user_id` still accepted (single member).
    """
    assigned_user_ids: Optional[List[int]] = None
    assigned_user_id: Optional[int] = None


class ClientAssigneeOut(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class Client(ClientBase):
    id: int
    organization_id: int
    is_default: bool = False
    is_archived: bool = False
    created_by: Optional[int] = None
    assigned_user_id: Optional[int] = None
    assigned_user_name: Optional[str] = None
    assigned_user_ids: List[int] = []
    assigned_user_names: List[str] = []
    assignees: List[ClientAssigneeOut] = []
    created_at: datetime
    updated_at: Optional[datetime] = None
    lead_count: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ClientList(BaseModel):
    items: List[Client]
    total: int
