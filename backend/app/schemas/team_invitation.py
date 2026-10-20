from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr

# Base schema
class TeamInvitationBase(BaseModel):
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: str = "member"
    message: Optional[str] = None

# Schema for creating invitations
class TeamInvitationCreate(TeamInvitationBase):
    pass

# Schema for updating invitations
class TeamInvitationUpdate(BaseModel):
    status: Optional[str] = None
    role: Optional[str] = None
    message: Optional[str] = None

# Schema for accepting invitations
class TeamInvitationAccept(BaseModel):
    # Required for new accounts; omit when joining with an existing authenticated account
    password: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None

# Schema for responses
class TeamInvitation(TeamInvitationBase):
    id: int
    invitation_token: str
    status: str
    organization_id: int
    invited_by_id: int
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Schema for listing invitations with inviter info
class TeamInvitationWithInviter(TeamInvitation):
    invited_by_name: str
    organization_name: str

    class Config:
        from_attributes = True

# Schema for invitation tokens (public info only)
class TeamInvitationToken(BaseModel):
    id: int
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: str
    organization_name: str
    invited_by_name: str
    status: str
    expires_at: datetime
    message: Optional[str] = None
    # True when this email already has a LeadLab account (join vs create)
    existing_user: bool = False

    class Config:
        from_attributes = True 