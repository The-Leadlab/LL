from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict, HttpUrl, constr, condecimal, field_validator
from datetime import datetime
from .note import Note as NoteSchema
from .tag import Tag as TagSchema

# Tag Update Schema
class LeadTagUpdate(BaseModel):
    tags: List[int]
    
    model_config = ConfigDict(from_attributes=True)

# User Schema for Lead Response
class UserInLead(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str

    model_config = ConfigDict(from_attributes=True)

# Stage Schema for Lead Response
class StageInLead(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)

# Base Lead Schema
class LeadBase(BaseModel):
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    company: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    mobile: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    country: Optional[str] = None
    website: Optional[str] = None
    sector: Optional[str] = None
    unique_lead_id: Optional[str] = None
    time_in_current_role: Optional[str] = None
    lab_comments: Optional[str] = None
    client_comments: Optional[str] = None
    psychometrics: Optional[Dict[str, Any]] = None
    wpi: Optional[str] = None
    source: Optional[str] = None
    est_wealth_experience: Optional[str] = None
    email_guidelines: Optional[str] = None
    sales_intelligence: Optional[Dict[str, Any]] = None

    @field_validator('psychometrics', mode='before')
    @classmethod
    def validate_psychometrics(cls, v):
        """Ensure psychometrics is always a dict, not a string"""
        import json
        if v is None:
            return {}
        if isinstance(v, dict):
            return v
        if isinstance(v, str):
            if v == '' or v == '{}':
                return {}
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, dict) else {}
            except (json.JSONDecodeError, ValueError):
                return {}
        return {}

    model_config = ConfigDict(from_attributes=True)

# Lead Create Schema
class LeadCreate(LeadBase):
    organization_id: int
    stage_id: Optional[int] = None
    client_id: Optional[int] = None
    user_id: int
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    tags: Optional[List[int]] = None

    model_config = ConfigDict(from_attributes=True)

# Lead Update Schema
class LeadUpdate(LeadBase):
    client_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

# Lead in DB Schema
class LeadInDBBase(LeadBase):
    id: int
    organization_id: int
    user_id: int
    stage_id: int
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_deleted: bool = False
    visible: bool = True
    full_name: str
    stage: Optional[StageInLead] = None
    user: Optional[UserInLead] = None
    creator: Optional[UserInLead] = None
    tags: List[TagSchema] = []

    model_config = ConfigDict(from_attributes=True)

# Lead Schema
class Lead(LeadInDBBase):
    notes: List[NoteSchema] = []

    model_config = ConfigDict(from_attributes=True)

# Lead List Response
class LeadListResponse(BaseModel):
    results: List[Lead]
    total: int
    page: int
    size: int
    has_more: bool

    model_config = ConfigDict(from_attributes=True)

# Lead Response
class LeadResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None
    data: Union[Lead, Dict[str, Any]]

    model_config = ConfigDict(from_attributes=True)