from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ClientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)


class Client(ClientBase):
    id: int
    organization_id: int
    is_default: bool = False
    is_archived: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    lead_count: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ClientList(BaseModel):
    items: List[Client]
    total: int
