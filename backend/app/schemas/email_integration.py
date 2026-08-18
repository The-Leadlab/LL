# app/schemas/email_integration.py
import re
import json
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, EmailStr, validator, root_validator
from app.models.email_account import EmailProviderType, EmailSyncStatus
from app.models.email_message import EmailDirection, EmailStatus

# Email Account Schemas
class EmailAccountBase(BaseModel):
    email: EmailStr
    display_name: str
    provider_type: str  # Changed from EmailProviderType to str for validation

    @validator('provider_type')
    def validate_provider_type(cls, v):
        try:
            # Convert to lowercase for validation
            v = v.lower()
            if v not in ['gmail', 'outlook', 'yahoo', 'custom']:
                raise ValueError("Invalid provider type")
            return v
        except AttributeError:
            raise ValueError("Provider type must be a string")

class EmailAccountCreate(EmailAccountBase):
    password: str
    custom_settings: Optional[Dict[str, Any]] = None

class EmailAccountUpdate(BaseModel):
    display_name: Optional[str] = None
    password: Optional[str] = None
    provider_type: Optional[str] = None
    custom_settings: Optional[Dict[str, Any]] = None
    sync_enabled: Optional[bool] = None
    sync_frequency_minutes: Optional[int] = None
    sync_sent_items: Optional[bool] = None
    sync_inbox: Optional[bool] = None
    days_to_sync: Optional[int] = None
    auto_create_contacts: Optional[bool] = None
    auto_create_tasks: Optional[bool] = None
    calendar_sync_enabled: Optional[bool] = None
    signature: Optional[str] = None

    @validator('provider_type')
    def validate_provider_type(cls, v):
        if v is None:
            return v
        try:
            # Convert to lowercase for validation
            v = v.lower()
            if v not in ['gmail', 'outlook', 'yahoo', 'custom']:
                raise ValueError("Invalid provider type")
            return v
        except AttributeError:
            raise ValueError("Provider type must be a string")

class EmailAccountOut(EmailAccountBase):
    id: int
    sync_status: EmailSyncStatus
    last_sync_at: Optional[datetime] = None
    sync_error_message: Optional[str] = None
    sync_enabled: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Email Message Schemas
class EmailBase(BaseModel):
    subject: str
    from_email: EmailStr
    from_name: Optional[str] = None
    to_emails: List[EmailStr]
    cc_emails: Optional[List[EmailStr]] = None
    bcc_emails: Optional[List[EmailStr]] = None

class EmailSend(BaseModel):
    account_id: int
    to_emails: List[str]
    cc_emails: Optional[List[str]] = []
    bcc_emails: Optional[List[str]] = []
    subject: str
    body_text: Optional[str] = None
    body_html: Optional[str] = None
    reply_to: Optional[str] = None

    @validator('to_emails', 'cc_emails', 'bcc_emails')
    def validate_emails(cls, v):
        if v is None:
            return []
        # Validate email format
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        for email in v:
            if not re.match(email_pattern, email):
                raise ValueError(f"Invalid email format: {email}")
        return v


class OutreachSend(BaseModel):
    """One personalized email per lead (cold outreach). Max 25 leads per request."""
    account_id: int
    lead_ids: List[int]
    subject: str
    body: str
    format: str = "text"  # text | html
    delay_seconds: float = 1.0

    @validator("lead_ids")
    def validate_lead_ids(cls, v):
        if not v:
            raise ValueError("Select at least one lead")
        if len(v) > 25:
            raise ValueError("Send at most 25 leads per batch")
        return v

    @validator("format")
    def validate_format(cls, v):
        mode = (v or "text").lower().strip()
        if mode not in {"text", "html"}:
            raise ValueError("format must be text or html")
        return mode

    @validator("delay_seconds")
    def validate_delay(cls, v):
        try:
            delay = float(v)
        except (TypeError, ValueError):
            return 1.0
        return max(0.0, min(delay, 10.0))

    @validator("subject", "body")
    def require_content(cls, v):
        if not (v or "").strip():
            raise ValueError("Subject and body are required")
        return v


class EmailCreate(EmailBase):
    message_id: str
    thread_id: Optional[str] = None
    body_text: Optional[str] = None
    body_html: Optional[str] = None
    direction: EmailDirection
    status: EmailStatus = EmailStatus.unread
    priority: str = "normal"
    sent_date: datetime
    received_date: Optional[datetime] = None
    is_important: bool = False
    is_starred: bool = False
    has_attachments: bool = False
    folder_name: Optional[str] = None
    email_account_id: int
    organization_id: int
    lead_id: Optional[int] = None
    deal_id: Optional[int] = None
    contact_id: Optional[int] = None

class EmailUpdate(BaseModel):
    status: Optional[EmailStatus] = None
    is_important: Optional[bool] = None
    is_starred: Optional[bool] = None
    lead_id: Optional[int] = None
    deal_id: Optional[int] = None
    contact_id: Optional[int] = None

class EmailOut(EmailBase):
    id: int
    message_id: str
    thread_id: Optional[str] = None
    body_text: Optional[str] = None
    body_html: Optional[str] = None
    direction: EmailDirection
    status: EmailStatus
    priority: str
    sent_date: datetime
    received_date: Optional[datetime] = None
    is_important: bool
    is_starred: bool
    has_attachments: bool
    folder_name: Optional[str] = None
    
    # Analysis results
    contains_meeting_info: bool
    extracted_dates: Optional[List[str]] = None
    action_items: Optional[List[str]] = None
    sentiment_score: Optional[str] = None
    
    # Relations
    email_account_id: int
    lead_id: Optional[int] = None
    deal_id: Optional[int] = None
    contact_id: Optional[int] = None
    
    created_at: datetime
    updated_at: Optional[datetime] = None

    @validator('to_emails', 'cc_emails', 'bcc_emails', pre=True)
    def parse_email_lists(cls, v):
        """Parse JSON strings to lists for email fields"""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return []
        elif isinstance(v, list):
            return v
        else:
            return []

    @validator('extracted_dates', 'action_items', pre=True)
    def parse_list_fields(cls, v):
        """Parse JSON strings to lists for analysis fields"""
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, ValueError):
                return []
        elif isinstance(v, list):
            return v
        else:
            return []

    class Config:
        from_attributes = True

# Email Suggestions Schema
class EmailSuggestion(BaseModel):
    type: str  # "event" or "task"
    title: str
    description: str
    confidence_score: float
    data: Dict[str, Any]

# Email Attachment Schema
class EmailAttachmentOut(BaseModel):
    id: int
    filename: str
    content_type: str
    size_bytes: int
    is_inline: bool
    is_calendar_invite: bool
    
    class Config:
        from_attributes = True

# Email Thread Schema
class EmailThreadOut(BaseModel):
    thread_id: str
    subject: str
    participants: List[EmailStr]
    email_count: int
    last_email_date: datetime
    has_unread: bool
    
# Email Search Schema
class EmailSearchParams(BaseModel):
    query: Optional[str] = None
    from_email: Optional[EmailStr] = None
    to_email: Optional[EmailStr] = None
    subject_contains: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    has_attachments: Optional[bool] = None
    status: Optional[EmailStatus] = None
    folder: Optional[str] = None
    account_id: Optional[int] = None

# Email Statistics Schema
class EmailStatsOut(BaseModel):
    total_emails: int
    unread_count: int
    today_count: int
    this_week_count: int
    meeting_emails_count: int
    task_emails_count: int 