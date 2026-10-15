import os
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api import deps
from app.core.config import settings
from app.core.security import check_permission
from app.utils.file_upload import upload_file
from app.schemas.organization_settings import (
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
    LogoUploadResponse
)

router = APIRouter(redirect_slashes=False)


@router.get("", response_model=OrganizationSettingsResponse)
def get_organization_settings(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get organization settings.
    """
    if not check_permission(db, current_user.id, "manage_settings"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access organization settings"
        )
    
    org_settings = crud.organization_settings.get_by_organization(
        db, current_user.organization_id
    )
    
    if not org_settings:
        raise HTTPException(
            status_code=404,
            detail="Organization settings not found"
        )
    
    return {
        "success": True,
        "message": "Organization settings retrieved successfully",
        "data": org_settings
    }


@router.put("", response_model=OrganizationSettingsResponse)
def update_organization_settings(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    settings_in: OrganizationSettingsUpdate,
) -> Any:
    """
    Update organization settings.
    """
    if not check_permission(db, current_user.id, "manage_settings"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage organization settings"
        )
    
    org_settings = crud.organization_settings.get_by_organization(
        db, current_user.organization_id
    )
    
    if not org_settings:
        raise HTTPException(
            status_code=404,
            detail="Organization settings not found"
        )

    # Validate currency if provided
    if settings_in.currency_id:
        currency = crud.currency.get(db, settings_in.currency_id)
        if not currency:
            raise HTTPException(
                status_code=400,
                detail="Invalid currency ID"
            )

    org_settings = crud.organization_settings.update(
        db, db_obj=org_settings, obj_in=settings_in
    )
    
    return {
        "success": True,
        "message": "Organization settings updated successfully",
        "data": org_settings
    }


@router.post("/logo", response_model=LogoUploadResponse)
async def upload_organization_logo(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    file: UploadFile = File(...),
) -> Any:
    """
    Upload organization logo.
    """
    if not check_permission(db, current_user.id, "manage_settings"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage organization logo"
        )

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only JPEG, PNG and GIF are allowed"
        )

    # Upload file
    try:
        file_path = f"organizations/{current_user.organization_id}/logo"
        logo_url = await upload_file(
            file,
            file_path,
            allowed_types=allowed_types,
            max_size=5_000_000  # 5MB
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    # Update organization settings
    org_settings = crud.organization_settings.update_logo(
        db,
        organization_id=current_user.organization_id,
        logo_url=logo_url
    )

    if not org_settings:
        raise HTTPException(
            status_code=404,
            detail="Organization settings not found"
        )

    return {
        "success": True,
        "message": "Logo uploaded successfully",
        "logo_url": logo_url
    }


@router.get("/timezones")
def list_timezones() -> Any:
    """
    Get list of available timezones.
    """
    import pytz
    return {
        "success": True,
        "message": "Timezones retrieved successfully",
        "data": pytz.all_timezones
    }


@router.get("/date-formats")
def list_date_formats() -> Any:
    """
    Get list of available date formats.
    """
    formats = [
        "YYYY-MM-DD",
        "DD-MM-YYYY",
        "MM-DD-YYYY",
        "YYYY.MM.DD",
        "DD.MM.YYYY",
        "MM.DD.YYYY",
        "YYYY/MM/DD",
        "DD/MM/YYYY",
        "MM/DD/YYYY"
    ]
    return {
        "success": True,
        "message": "Date formats retrieved successfully",
        "data": formats
    }


@router.get("/time-formats")
def list_time_formats() -> Any:
    """
    Get list of available time formats.
    """
    formats = [
        "HH:mm",
        "HH:mm:ss",
        "hh:mm A",
        "hh:mm:ss A"
    ]
    return {
        "success": True,
        "message": "Time formats retrieved successfully",
        "data": formats
    }
