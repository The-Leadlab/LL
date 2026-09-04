"""
Email Sequence Schemas

Pydantic schemas for automated email campaigns.
"""

from __future__ import annotations  # Enable forward references for type hints

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, EmailStr


# Sequence Step Definition
class SequenceStepDefinition(BaseModel):
    """Step definition in sequence template"""
    step: int = Field(..., description="Step number", ge=1)
    delay_days: int = Field(..., description="Days to wait after previous step", ge=0)
    subject: str = Field(..., description="Email subject line")
    body: str = Field(..., description="Email body (HTML or plain text)")
    template_id: Optional[int] = Field(None, description="Optional email template ID")


# Email Sequence Schemas
class EmailSequenceBase(BaseModel):
    """Base email sequence schema"""
    name: str = Field(..., description="Sequence name", max_length=255)
    description: Optional[str] = Field(None, description="Sequence description")
    is_active: bool = Field(True, description="Is sequence active?")
    steps: List[SequenceStepDefinition] = Field(..., description="Sequence steps")
    email_account_id: Optional[int] = Field(None, description="Connected mailbox used by the worker")
    settings: Optional[Dict[str, Any]] = Field(
        None,
        description="Campaign timing: timezone, send_window_start/end, weekdays_only, max_per_hour",
    )


class EmailSequenceCreate(EmailSequenceBase):
    """Create email sequence"""
    pass


class EmailSequenceUpdate(BaseModel):
    """Update email sequence"""
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    steps: Optional[List[SequenceStepDefinition]] = None
    email_account_id: Optional[int] = None
    settings: Optional[Dict[str, Any]] = None


class EmailSequenceResponse(EmailSequenceBase):
    """Email sequence response"""
    id: int
    organization_id: int
    created_by_id: Optional[int] = None
    total_enrolled: int = 0
    total_completed: int = 0
    total_replied: int = 0
    created_at: datetime
    email_account_id: Optional[int] = None
    settings: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


class EmailSequenceStats(BaseModel):
    """Sequence statistics"""
    id: int
    name: str
    total_enrolled: int
    total_completed: int
    total_replied: int
    active_enrollments: int
    completion_rate: float = 0.0
    reply_rate: float = 0.0
    avg_days_to_complete: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


# Sequence Enrollment Schemas
class SequenceEnrollmentBase(BaseModel):
    """Base sequence enrollment schema"""
    lead_id: int = Field(..., description="Lead to enroll")


class SequenceEnrollmentCreate(SequenceEnrollmentBase):
    """Create sequence enrollment"""
    sequence_id: int = Field(..., description="Sequence ID")


class SequenceEnrollmentUpdate(BaseModel):
    """Update sequence enrollment"""
    status: Optional[str] = Field(None, description="Status: active, completed, paused, replied")


class SequenceEnrollmentResponse(SequenceEnrollmentBase):
    """Sequence enrollment response"""
    id: int
    sequence_id: int
    current_step: int
    status: str
    enrolled_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Sequence Step Execution Schemas (MOVED BEFORE SequenceEnrollmentDetail to fix forward reference)
class SequenceStepBase(BaseModel):
    """Base sequence step schema"""
    step_number: int = Field(..., description="Step number in sequence")
    status: str = Field("pending", description="Status: pending, sent, opened, clicked, replied")


class SequenceStepResponse(SequenceStepBase):
    """Sequence step response"""
    id: int
    enrollment_id: int
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    clicked_at: Optional[datetime] = None
    replied_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Now SequenceStepResponse is defined, so SequenceEnrollmentDetail can use it
class SequenceEnrollmentDetail(SequenceEnrollmentResponse):
    """Detailed enrollment with steps"""
    steps: List[SequenceStepResponse] = []

    model_config = ConfigDict(from_attributes=True)


# Bulk Enrollment
class BulkEnrollRequest(BaseModel):
    """Bulk enrollment request"""
    sequence_id: int = Field(..., description="Sequence ID")
    lead_ids: List[int] = Field(..., description="List of lead IDs to enroll")


class BulkEnrollResponse(BaseModel):
    """Bulk enrollment response"""
    sequence_id: int
    enrolled_count: int
    already_enrolled_count: int
    failed_count: int
    enrollments: List[SequenceEnrollmentResponse] = []


# Analytics Schemas
class SequencePerformance(BaseModel):
    """Sequence performance metrics"""
    sequence_id: int
    sequence_name: str
    total_enrollments: int
    active_enrollments: int
    completed_enrollments: int
    reply_rate: float
    open_rate: float
    click_rate: float
    avg_time_to_reply_days: Optional[float] = None
    step_performance: List[Dict[str, Any]] = []


class StepPerformance(BaseModel):
    """Step-level performance metrics"""
    step_number: int
    total_sent: int
    opened: int
    clicked: int
    replied: int
    open_rate: float
    click_rate: float
    reply_rate: float


# Email Template Schemas (for sequence steps)
class EmailTemplate(BaseModel):
    """Email template for sequence steps"""
    id: int
    name: str
    subject: str
    body: str
    variables: List[str] = []  # Available merge variables

    model_config = ConfigDict(from_attributes=True)


# Sequence Actions
class PauseEnrollmentRequest(BaseModel):
    """Pause enrollment request"""
    enrollment_id: int


class ResumeEnrollmentRequest(BaseModel):
    """Resume enrollment request"""
    enrollment_id: int


class UnsubscribeRequest(BaseModel):
    """Unsubscribe from sequence"""
    enrollment_id: int
    reason: Optional[str] = None


# CRITICAL: Rebuild models to resolve forward references in Pydantic v2
# This is required because SequenceEnrollmentDetail uses SequenceStepResponse
# Without this, FastAPI will fail to load the module at startup
SequenceEnrollmentDetail.model_rebuild()
