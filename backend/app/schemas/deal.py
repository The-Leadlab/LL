from typing import Optional, List, Dict, Any
from pydantic import BaseModel, field_validator
from datetime import datetime, date
from app.models.deal import DealStatus
from decimal import Decimal


def _empty_date_to_none(value):
    if value is None or value == "":
        return None
    return value

# Deal Base Schema
class DealBase(BaseModel):
    name: str
    description: Optional[str] = None
    amount: Decimal
    currency_id: int
    status: DealStatus
    valid_until: Optional[date] = None
    assigned_to_id: int
    lead_id: int

    @field_validator("valid_until", mode="before")
    @classmethod
    def coerce_empty_valid_until(cls, value):
        return _empty_date_to_none(value)

# Properties to receive via API on creation
class DealCreate(BaseModel):
    name: str
    description: Optional[str] = None
    amount: Decimal
    currency_id: int
    status: DealStatus
    valid_until: Optional[date] = None
    assigned_to_id: int
    lead_id: int
    organization_id: Optional[int] = None

    @field_validator("valid_until", mode="before")
    @classmethod
    def coerce_empty_valid_until(cls, value):
        return _empty_date_to_none(value)

# Properties to receive via API on update
class DealUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    currency_id: Optional[int] = None
    status: Optional[DealStatus] = None
    valid_until: Optional[date] = None
    assigned_to_id: Optional[int] = None
    lead_id: Optional[int] = None

    @field_validator("valid_until", mode="before")
    @classmethod
    def coerce_empty_valid_until(cls, value):
        return _empty_date_to_none(value)

# Properties stored in DB
class DealInDB(DealBase):
    id: int
    created_at: datetime
    updated_at: datetime
    accepted_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Properties to return via API
class Deal(DealInDB):
    class Config:
        from_attributes = True

# Properties for Deal list
class DealList(BaseModel):
    items: List[Deal]
    total: int

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda dt: dt.isoformat()
        }

# Pipeline statistics
class PipelineStats(BaseModel):
    total_value: float
    by_status: Dict[str, Dict[str, float]]
    total_deals: Optional[int] = None
    by_probability: Optional[Dict[str, Dict[str, float]]] = None

    class Config:
        from_attributes = True

# Standard API response
class DealResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None
