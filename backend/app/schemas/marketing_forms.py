from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class MarketingFormSubmissionCreate(BaseModel):
    """Public marketing / lead capture forms (no auth)."""

    form_type: Literal["business_diagnostic", "data_request", "pitch_your_idea"] = Field(
        ..., description="Which form was submitted"
    )
    full_name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    company: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    subject: Optional[str] = Field(None, max_length=300)
    payload: Dict[str, Any] = Field(default_factory=dict, description="Form-specific fields")
    to_email: EmailStr = Field(default="info@the-leadlab.com")
