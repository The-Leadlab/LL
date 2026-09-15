from typing import List, Optional, Any
from pathlib import Path
import mimetypes
from datetime import datetime
import time
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from app.api import deps
from app.crud import crud_user
from app.models.user import User as UserModel
from app.schemas.user import User, UserCreate, UserUpdate, UserInDB, UserList, UserResponse
from app.core.security import get_password_hash
from app.core.config import settings
from app.core.avatars import initials_avatar_svg
from app.core.workspace import (
    PERSONAL_ORG_SENTINEL,
    provision_personal_organization,
    record_team_membership,
)
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
import logging

logger = logging.getLogger(__name__)


def _organization_role_for_api(user: UserModel) -> str:
    """
    Map DB user to API organization_role (viewer | member | manager).
    Production DB uses `users.role`; `organization_role` may not exist on the model.
    """
    raw = getattr(user, "organization_role", None)
    if raw is not None:
        if hasattr(raw, "value"):
            return str(raw.value).lower()
        return str(raw).lower()
    role_val = getattr(user, "role", None) or ""
    r = str(role_val).strip().lower()
    if r in ("admin", "superuser", "super_admin"):
        return "manager"
    if r in ("manager", "org_manager", "organization_manager"):
        return "manager"
    if r in ("viewer", "read_only"):
        return "viewer"
    return "member"


_AVATAR_ALLOWED_TYPES = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"})
_AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 2MB
_AVATAR_SUFFIX = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

_EXT_TO_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

def _resolve_workspace_org_id(
    db: Session,
    *,
    requested_org_id: Optional[int],
    first_name: Optional[str],
    last_name: Optional[str],
    email: Optional[str],
) -> tuple[int, bool]:
    """Return (organization_id, joining_existing_team)."""
    if requested_org_id in (None, PERSONAL_ORG_SENTINEL):
        org = provision_personal_organization(
            db,
            first_name=first_name,
            last_name=last_name,
            email=email,
        )
        return int(org.id), False
    return int(requested_org_id), True


def _mime_from_filename(filename: str) -> Optional[str]:
    suf = Path(filename or "").suffix.lower()
    return _EXT_TO_MIME.get(suf)


def _avatar_storage_dir() -> Path:
    p = Path(settings.UPLOAD_DIR) / "avatars"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _avatar_paths_for_user(user_id: int) -> List[Path]:
    """Possible on-disk avatar files for this user (single active file expected)."""
    base = _avatar_storage_dir()
    return [base / f"{user_id}{suf}" for suf in (".jpg", ".jpeg", ".png", ".gif", ".webp")]


def _find_avatar_file(user_id: int) -> Optional[Path]:
    for path in _avatar_paths_for_user(user_id):
        if path.is_file():
            return path
    return None


def _remove_existing_avatars(user_id: int) -> None:
    for path in _avatar_paths_for_user(user_id):
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                pass

router = APIRouter()

@router.get("", response_model=UserList)
@router.get("/", response_model=UserList)
def get_users(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    organization_id: Optional[int] = None,
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve users.
    """
    logger.debug(f"Getting users for user {current_user.id}, skip={skip}, organization_id={organization_id}")
    
    if current_user.is_admin and not organization_id:
        users = crud_user.user.get_multi(db, skip=skip)
    else:
        # Get users from the specified organization or current user's organization
        users = crud_user.user.get_multi(
            db,
            organization_id=organization_id or int(current_user.organization_id),
            is_active=True
        )
    
    total = len(users)
    page = skip // 100 + 1
    has_more = False
    
    # Convert User models to UserResponse
    user_responses = [
        UserResponse(
            id=int(user.id),
            email=str(user.email),
            first_name=str(user.first_name),
            last_name=str(user.last_name),
            is_active=bool(user.is_active),
            is_admin=bool(user.is_admin),
            organization_id=int(user.organization_id)
        ) for user in users
    ]
    
    logger.debug(f"Returning {total} users")
    
    return UserList(
        items=user_responses,
        total=total,
        page=page,
        size=total,
        has_more=has_more
    )

@router.post("", response_model=UserInDB)
@router.post("/", response_model=UserInDB)
def create_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
    user_in: UserCreate,
) -> UserInDB:
    """
    Create new user.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to create users"
        )
    
    user = crud_user.user.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="A user with this email already exists"
        )
    
    requested_org = user_in.organization_id
    org_id, joining_existing_team = _resolve_workspace_org_id(
        db,
        requested_org_id=requested_org,
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        email=str(user_in.email),
    )
    user_in.organization_id = org_id

    user = crud_user.user.create(db, obj_in=user_in)
    if joining_existing_team:
        record_team_membership(
            db,
            user=user,
            organization_id=int(user.organization_id),
            invited_by_id=int(current_user.id),
        )
    return user

@router.get("/me", response_model=UserInDB)
def get_current_user_info(
    current_user: UserModel = Depends(deps.get_current_user),
) -> UserInDB:
    """
    Get current user info.
    """
    return current_user

@router.put("/me", response_model=UserInDB)
def update_current_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
    user_in: UserUpdate,
) -> UserInDB:
    """
    Update current user.
    """
    # Password will be hashed directly by CRUD service
    # No need to assign hashed_password

    user = crud_user.user.update(db, db_obj=current_user, obj_in=user_in)
    return user


@router.post("/me/avatar")
async def upload_my_avatar(
    *,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """Upload profile photo (JPG, PNG, GIF, WebP — max 2MB). Stored on disk; no DB column required."""
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in _AVATAR_ALLOWED_TYPES:
        content_type = _mime_from_filename(file.filename or "") or ""
    if content_type not in _AVATAR_ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Use JPG, PNG, GIF, or WebP.",
        )
    data = await file.read()
    if len(data) > _AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 2MB).")
    if len(data) < 32:
        raise HTTPException(status_code=400, detail="Invalid image file.")

    suffix = _AVATAR_SUFFIX.get(content_type)
    if not suffix:
        raise HTTPException(status_code=400, detail="Could not determine image type.")
    _remove_existing_avatars(int(current_user.id))
    out = _avatar_storage_dir() / f"{current_user.id}{suffix}"
    out.write_bytes(data)
    logger.info("User %s uploaded avatar (%s bytes)", current_user.id, len(data))
    return {"success": True, "message": "Avatar updated"}


@router.get("/me/avatar")
def get_my_avatar(
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """
    Return the current user's avatar image (requires Authorization).
    If none uploaded, return a generated initials SVG so the UI never shows a blank/white circle.
    """
    path = _find_avatar_file(int(current_user.id))
    if not path:
        svg = initials_avatar_svg(
            user_id=int(current_user.id),
            first_name=getattr(current_user, "first_name", None),
            last_name=getattr(current_user, "last_name", None),
            email=getattr(current_user, "email", None),
        )
        return Response(
            content=svg,
            media_type="image/svg+xml",
            headers={"Cache-Control": "no-store"},
        )
    media = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return FileResponse(path, media_type=media)


@router.get("/organization-users", response_model=List[UserResponse])
def get_organization_users(
    current_user: UserModel = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    """Get all users from the same organization as the current user"""
    try:
        print(f"DEBUG: Current user: {current_user.email if current_user else 'None'}")
        print(f"DEBUG: Organization ID: {current_user.organization_id if current_user else 'None'}")
        
        if not current_user or not current_user.organization_id:
            raise HTTPException(
                status_code=422,
                detail="Current user or organization ID not found"
            )
            
        users = crud_user.user.get_organization_users(
            db=db,
            organization_id=int(current_user.organization_id)
        )
        
        print(f"DEBUG: Found {len(users) if users else 0} users")
        
        if not users:
            return []
        
        # Convert User models to UserResponse and validate data
        user_responses = []
        for user in users:
            try:
                org_role = _organization_role_for_api(user)

                user_response = UserResponse(
                    id=int(user.id),
                    email=str(user.email),
                    first_name=user.first_name or "",
                    last_name=user.last_name or "",
                    is_active=bool(user.is_active),
                    is_admin=bool(user.is_admin),
                    organization_id=int(user.organization_id),
                    organization_role=org_role,
                    job_title=user.job_title if hasattr(user, 'job_title') else None,
                    last_login=user.last_login if hasattr(user, 'last_login') else None,
                    linkedin_profile_id=user.linkedin_profile_id if hasattr(user, 'linkedin_profile_id') else None,
                    linkedin_profile_url=user.linkedin_profile_url if hasattr(user, 'linkedin_profile_url') else None
                )
                user_responses.append(user_response)
            except (ValueError, TypeError, AttributeError) as e:
                print(f"Error converting user {user.id}: {str(e)}")
                continue
        
        print(f"DEBUG: Returning {len(user_responses)} user responses")
        return user_responses
        
    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid data format: {str(e)}"
        )
    except Exception as e:
        print(f"Error fetching organization users: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching organization users: {str(e)}"
        )

@router.get("/{user_id}", response_model=UserInDB)
def get_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
    user_id: int,
) -> UserInDB:
    """
    Get user by ID.
    """
    if not current_user.is_admin and current_user.id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions"
        )
    
    user = crud_user.user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )
    return user

@router.put("/{user_id}", response_model=UserInDB)
def update_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
    user_id: int,
    user_in: UserUpdate,
) -> UserInDB:
    """
    Update user.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to update users"
        )
    
    user = crud_user.user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Password will be hashed directly by CRUD service
    # No need to assign hashed_password

    previous_org = int(user.organization_id) if user.organization_id else None
    incoming_org = user_in.organization_id
    joining_existing_team = False
    if incoming_org is not None:
        org_id, joining_existing_team = _resolve_workspace_org_id(
            db,
            requested_org_id=incoming_org,
            first_name=user_in.first_name or user.first_name,
            last_name=user_in.last_name or user.last_name,
            email=str(user_in.email or user.email),
        )
        user_in.organization_id = org_id
    user = crud_user.user.update(db, db_obj=user, obj_in=user_in)
    if joining_existing_team and user.organization_id and int(user.organization_id) != previous_org:
        record_team_membership(
            db,
            user=user,
            organization_id=int(user.organization_id),
            invited_by_id=int(current_user.id),
        )
    return user

@router.patch("/{user_id}", response_model=UserInDB)
def patch_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
    user_id: int,
    user_in: UserUpdate,
) -> UserInDB:
    """
    Partially update user.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to update users"
        )
    
    user = crud_user.user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # We'll pass the password directly to the CRUD service,
    # not assigning hashed_password because the model doesn't support this field
    # and the CRUD service already hashes the password

    previous_org = int(user.organization_id) if user.organization_id else None
    update_data = user_in.dict(exclude_unset=True)
    joining_existing_team = False
    if "organization_id" in update_data:
        org_id, joining_existing_team = _resolve_workspace_org_id(
            db,
            requested_org_id=update_data.get("organization_id"),
            first_name=update_data.get("first_name") or user.first_name,
            last_name=update_data.get("last_name") or user.last_name,
            email=str(update_data.get("email") or user.email),
        )
        update_data["organization_id"] = org_id
    user = crud_user.user.update(db, db_obj=user, obj_in=update_data)
    if joining_existing_team and user.organization_id and int(user.organization_id) != previous_org:
        record_team_membership(
            db,
            user=user,
            organization_id=int(user.organization_id),
            invited_by_id=int(current_user.id),
        )
    return user

@router.delete("/{user_id}", response_model=UserInDB)
def delete_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
    user_id: int,
) -> UserInDB:
    """
    Delete user.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to delete users"
        )
    
    user = crud_user.user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if (user.email or "").strip().lower() == "ali@the-leadlab.com":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete protected admin account"
        )
    
    user = crud_user.user.remove(db=db, id=user_id)
    return user


@router.post("/actions/deactivate-all-except-ali", response_model=dict)
@router.post("/actions/delete-all-except-ali", response_model=dict)
def delete_all_except_ali(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """
    Permanently delete every user except ali@the-leadlab.com (and their dependent rows).
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to delete users",
        )

    from app.services.user_purge_service import hard_delete_all_except_ali

    try:
        return hard_delete_all_except_ali(db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete users: {exc}",
        ) from exc
