from typing import Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api import deps
from app.core.security import check_permission
from app.schemas.api_token import (
    APITokenResponse,
    APITokenListResponse,
    APITokenUsageListResponse,
    APITokenStatsResponse
)

router = APIRouter(redirect_slashes=False)


@router.get("", response_model=APITokenListResponse)
def list_tokens(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    name: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_expired: Optional[bool] = None,
) -> Any:
    """
    List API tokens with filtering and pagination.
    """
    if not check_permission(db, current_user.id, "manage_api_tokens"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage API tokens"
        )

    filters = {}
    if name:
        filters["name"] = name
    if is_active is not None:
        filters["is_active"] = is_active
    if is_expired is not None:
        filters["is_expired"] = is_expired

    tokens = crud.api_token.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        filters=filters
    )

    return {
        "success": True,
        "message": "API tokens retrieved successfully",
        "data": tokens
    }


@router.post("", response_model=APITokenResponse)
def create_token(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    token_in: schemas.APITokenCreate,
) -> Any:
    """
    Create new API token.
    """
    if not check_permission(db, current_user.id, "manage_api_tokens"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage API tokens"
        )

    token = crud.api_token.create(db, obj_in=token_in)
    return {
        "success": True,
        "message": "API token created successfully",
        "data": token
    }


@router.get("/{id}", response_model=APITokenResponse)
def get_token(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get API token by ID.
    """
    if not check_permission(db, current_user.id, "manage_api_tokens"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage API tokens"
        )

    token = crud.api_token.get(db, id)
    if not token:
        raise HTTPException(
            status_code=404,
            detail="API token not found"
        )

    if token.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this token"
        )

    return {
        "success": True,
        "message": "API token retrieved successfully",
        "data": token
    }


@router.put("/{id}", response_model=APITokenResponse)
def update_token(
    id: int,
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    token_in: schemas.APITokenUpdate,
) -> Any:
    """
    Update API token.
    """
    if not check_permission(db, current_user.id, "manage_api_tokens"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage API tokens"
        )

    token = crud.api_token.get(db, id)
    if not token:
        raise HTTPException(
            status_code=404,
            detail="API token not found"
        )

    if token.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to modify this token"
        )

    token = crud.api_token.update(db, db_obj=token, obj_in=token_in)
    return {
        "success": True,
        "message": "API token updated successfully",
        "data": token
    }


@router.delete("/{id}", response_model=APITokenResponse)
def delete_token(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Delete API token.
    """
    if not check_permission(db, current_user.id, "manage_api_tokens"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage API tokens"
        )

    token = crud.api_token.get(db, id)
    if not token:
        raise HTTPException(
            status_code=404,
            detail="API token not found"
        )

    if token.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to delete this token"
        )

    token = crud.api_token.remove(db, id=id)
    return {
        "success": True,
        "message": "API token deleted successfully",
        "data": token
    }


@router.get("/{id}/usage", response_model=APITokenUsageListResponse)
def get_token_usage(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    endpoint: Optional[str] = None,
    method: Optional[str] = None,
    status_code: Optional[int] = None,
    ip_address: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Any:
    """
    Get API token usage logs.
    """
    if not check_permission(db, current_user.id, "manage_api_tokens"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to view token usage"
        )

    token = crud.api_token.get(db, id)
    if not token:
        raise HTTPException(
            status_code=404,
            detail="API token not found"
        )

    if token.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this token"
        )

    filters = {}
    if endpoint:
        filters["endpoint"] = endpoint
    if method:
        filters["method"] = method
    if status_code:
        filters["status_code"] = status_code
    if ip_address:
        filters["ip_address"] = ip_address
    if start_date:
        filters["start_date"] = start_date
    if end_date:
        filters["end_date"] = end_date

    logs = crud.api_token_usage.get_multi(
        db,
        token_id=id,
        skip=skip,
        limit=limit,
        filters=filters
    )

    return {
        "success": True,
        "message": "Token usage logs retrieved successfully",
        "data": logs
    }


@router.get("/{id}/stats", response_model=APITokenStatsResponse)
def get_token_stats(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    days: int = Query(30, ge=1, le=365),
) -> Any:
    """
    Get API token usage statistics.
    """
    if not check_permission(db, current_user.id, "manage_api_tokens"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to view token statistics"
        )

    token = crud.api_token.get(db, id)
    if not token:
        raise HTTPException(
            status_code=404,
            detail="API token not found"
        )

    if token.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this token"
        )

    stats = crud.api_token.get_token_stats(db, id, days=days)
    return {
        "success": True,
        "message": "Token statistics retrieved successfully",
        "data": stats
    }
