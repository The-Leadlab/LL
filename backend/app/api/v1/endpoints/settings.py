from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api import deps
from app.schemas.settings import (
    OrganizationSettingsCreate,
    OrganizationSettingsUpdate,
    OrganizationSettingsInDBBase,
    EmailSettingsCreate,
    EmailSettingsUpdate,
    EmailSettingsInDBBase,
    EmailTemplateCreate,
    EmailTemplateUpdate,
    EmailTemplateInDBBase,
)
from app.models.user import User

router = APIRouter(redirect_slashes=False)

# Temporary mock data for settings until proper models are implemented
@router.get("/organization")
def get_organization_settings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get organization settings.
    """
    # Mock organization settings data
    return {
        "id": current_user.organization_id,
        "name": "Default Organization",
        "timezone": "UTC",
        "date_format": "YYYY-MM-DD",
        "time_format": "24h",
        "currency": "USD",
        "language": "en",
        "email_notifications": True,
        "sms_notifications": False,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
    }

@router.put("/organization")
def update_organization_settings(
    settings_data: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update organization settings.
    """
    # Mock update - in real implementation, update database
    return {
        "id": current_user.organization_id,
        "message": "Settings updated successfully",
        "updated_fields": list(settings_data.keys())
    }

@router.get("/email")
def get_email_settings(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get email settings.
    """
    return {
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_username": "noreply@example.com",
        "smtp_use_tls": True,
        "from_email": "noreply@example.com",
        "from_name": "LeadLab",
        "enabled": True
    }

@router.put("/email")
def update_email_settings(
    email_data: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update email settings.
    """
    return {
        "message": "Email settings updated successfully",
        "updated_fields": list(email_data.keys())
    }

@router.get("/email/templates")
def get_email_templates(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get email templates.
    """
    return [
        {
            "id": 1,
            "name": "Welcome Email",
            "subject": "Welcome to LeadLab",
            "body": "Welcome to our platform!",
            "template_type": "welcome",
            "created_at": "2024-01-01T00:00:00Z"
        },
        {
            "id": 2,
            "name": "Follow Up",
            "subject": "Follow up on your inquiry",
            "body": "Thank you for your interest...",
            "template_type": "followup",
            "created_at": "2024-01-01T00:00:00Z"
        }
    ]

@router.post("/email/templates")
def create_email_template(
    template_data: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create email template.
    """
    return {
        "id": 3,
        "message": "Email template created successfully",
        **template_data,
        "created_at": "2024-01-01T00:00:00Z"
    }

@router.put("/email/templates/{template_id}")
def update_email_template(
    template_id: int,
    template_data: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update email template.
    """
    return {
        "id": template_id,
        "message": "Email template updated successfully",
        **template_data,
        "updated_at": "2024-01-01T00:00:00Z"
    }

@router.delete("/email/templates/{template_id}")
def delete_email_template(
    template_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete email template.
    """
    return {
        "message": f"Email template {template_id} deleted successfully"
    }
