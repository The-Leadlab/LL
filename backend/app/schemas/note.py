from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

# Note Base Schema
class NoteBase(BaseModel):
    content: str
    lead_id: int
    organization_id: int
    deal_id: Optional[int] = None

# Client sends content + lead. Organization and author are set by the server.
class NoteCreate(BaseModel):
    content: str
    lead_id: int
    organization_id: Optional[int] = None
    deal_id: Optional[int] = None
    created_by_id: Optional[int] = None

# Properties to receive via API on update
class NoteUpdate(BaseModel):
    content: Optional[str] = None

# Properties stored in DB
class NoteInDB(NoteBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by_id: int

    class Config:
        from_attributes = True

# Properties to return via API
class Note(NoteInDB):
    pass

# Properties for Note list
class NoteList(BaseModel):
    items: List[Note]
    total: int

    class Config:
        from_attributes = True
