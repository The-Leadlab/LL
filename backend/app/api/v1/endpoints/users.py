from typing import List, Optional, Any, Literal
from pathlib import Path
import mimetypes
from datetime import datetime
import time
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from app.api import deps
from app.crud import crud_user
from app.models.user import User as UserModel
from app.schemas.user import User, UserCreate, UserUpdate, UserInDB, UserList, UserResponse
from pydantic import BaseModel, Field
from app.core.security import get_password_hash
from app.core.config import settings
from app.core.avatars import initials_avatar_svg
from app.core.workspace import (
    PERSONAL_ORG_SENTINEL,
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
        from app.core.workspace import (
            find_organization_id_for_business_domain,
            provision_personal_organization as _provision,
        )

        domain_org = find_organization_id_for_business_domain(db, email)
        if domain_org:
            return int(domain_org), True
        org = _provision(
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

def _is_platform_admin(user: UserModel) -> bool:
    return bool(getattr(user, "is_admin", False) or getattr(user, "is_superuser", False))


def _scoped_list_organization_id(
    current_user: UserModel,
    organization_id: Optional[int],
) -> int:
    """
    Non-admins are always scoped to their own org.
    Admins default to their own org and may only list another org when it is explicit.
    """
    own_org = getattr(current_user, "organization_id", None)
    if not own_org:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Current user or organization ID not found",
        )
    own_org_id = int(own_org)
    if organization_id in (None, PERSONAL_ORG_SENTINEL):
        return own_org_id
    requested = int(organization_id)
    if requested == own_org_id:
        return own_org_id
    if not _is_platform_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot list users from another organization",
        )
    return requested


def _to_user_response(user: UserModel, *, is_self: bool = False) -> UserResponse:
    org_role = _organization_role_for_api(user)
    return UserResponse(
        id=int(user.id),
        email=str(user.email),
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        is_active=bool(user.is_active),
        is_admin=bool(user.is_admin),
        organization_id=int(user.organization_id),
        organization_role=org_role,
        job_title=getattr(user, "job_title", None),
        last_login=getattr(user, "last_login", None),
        created_at=getattr(user, "created_at", None),
        linkedin_profile_id=getattr(user, "linkedin_profile_id", None),
        linkedin_profile_url=getattr(user, "linkedin_profile_url", None),
        is_self=is_self,
    )


def _list_active_org_users(
    db: Session,
    *,
    organization_id: int,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[UserModel], int]:
    total = crud_user.user.count_multi(
        db,
        organization_id=organization_id,
        is_active=True,
        exclude_tombstones=True,
    )
    users = crud_user.user.get_multi(
        db,
        skip=skip,
        limit=limit,
        organization_id=organization_id,
        is_active=True,
        exclude_tombstones=True,
        order_by_name=True,
    )
    return users, total


def _user_list_payload(
    users: list[UserModel],
    *,
    total: int,
    skip: int,
    limit: int,
    current_user_id: Optional[int] = None,
) -> UserList:
    page_size = max(int(limit), 1)
    items = [
        _to_user_response(
            user,
            is_self=current_user_id is not None and int(user.id) == int(current_user_id),
        )
        for user in users
    ]
    return UserList(
        items=items,
        total=total,
        page=skip // page_size + 1,
        size=len(items),
        has_more=skip + len(items) < total,
    )


def _record_membership_if_joining(
    db: Session,
    *,
    user: UserModel,
    current_user: UserModel,
    joining_existing_team: bool,
) -> None:
    if joining_existing_team and user.organization_id:
        record_team_membership(
            db,
            user=user,
            organization_id=int(user.organization_id),
            invited_by_id=int(current_user.id),
        )


router = APIRouter(redirect_slashes=False)

@router.get("", response_model=UserList)
@router.get("/", response_model=UserList)
def get_users(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    organization_id: Optional[int] = None,
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve active users in the caller's organization.

    Non-admins cannot list another organization. Admins default to their own
    org and may pass organization_id to list a different one.
    """
    scoped_org_id = _scoped_list_organization_id(current_user, organization_id)
    users, total = _list_active_org_users(
        db,
        organization_id=scoped_org_id,
        skip=skip,
        limit=limit,
    )
    logger.debug(
        "Returning %s/%s users for org %s (user %s)",
        len(users),
        total,
        scoped_org_id,
        current_user.id,
    )
    return _user_list_payload(
        users,
        total=total,
        skip=skip,
        limit=limit,
        current_user_id=int(current_user.id),
    )

@router.post("", response_model=UserInDB)
@router.post("/", response_model=UserInDB)
def create_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_admin_user),
    user_in: UserCreate,
) -> UserInDB:
    """
    Create new user.
    """
    
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
    _record_membership_if_joining(
        db,
        user=user,
        current_user=current_user,
        joining_existing_team=joining_existing_team,
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


@router.get("/assignable", response_model=UserList)
@router.get("/assignable/", response_model=UserList)
def get_assignable_users(
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
    skip: int = 0,
    limit: int = Query(500, ge=1, le=500),
) -> Any:
    """Active members of the caller's organization, with the caller first."""
    scoped_org_id = _scoped_list_organization_id(current_user, None)
    users, total = _list_active_org_users(
        db,
        organization_id=scoped_org_id,
        skip=0,
        limit=max(skip + limit, limit),
    )
    caller_id = int(current_user.id)
    caller = next((user for user in users if int(user.id) == caller_id), None)
    others = [user for user in users if int(user.id) != caller_id]
    if caller is None:
        caller = current_user
        total = max(total, len(others) + 1)
    ordered = [caller] + others
    paged = ordered[skip: skip + limit]
    return _user_list_payload(
        paged,
        total=total,
        skip=skip,
        limit=limit,
        current_user_id=caller_id,
    )


@router.get("/organization-users", response_model=List[UserResponse])
def get_organization_users(
    current_user: UserModel = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    organization_id: Optional[int] = None,
):
    """Active users in the caller's org (same scoping as GET /users)."""
    scoped_org_id = _scoped_list_organization_id(current_user, organization_id)
    users, _total = _list_active_org_users(
        db,
        organization_id=scoped_org_id,
        skip=skip,
        limit=limit,
    )
    return [
        _to_user_response(user, is_self=int(user.id) == int(current_user.id))
        for user in users
    ]

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
    user = crud_user.user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )
    same_org = (
        getattr(current_user, "organization_id", None)
        and getattr(user, "organization_id", None)
        and int(current_user.organization_id) == int(user.organization_id)
    )
    if not current_user.is_admin and current_user.id != user_id and not same_org:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions"
        )
    return user

@router.put("/{user_id}", response_model=UserInDB)
def update_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_admin_user),
    user_id: int,
    user_in: UserUpdate,
) -> UserInDB:
    """
    Update user.
    """
    
    user = crud_user.user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Password will be hashed directly by CRUD service
    # No need to assign hashed_password

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
    _record_membership_if_joining(
        db,
        user=user,
        current_user=current_user,
        joining_existing_team=joining_existing_team,
    )
    return user

@router.patch("/{user_id}", response_model=UserInDB)
def patch_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_admin_user),
    user_id: int,
    user_in: UserUpdate,
) -> UserInDB:
    """
    Partially update user.
    """
    
    user = crud_user.user.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # We'll pass the password directly to the CRUD service,
    # not assigning hashed_password because the model doesn't support this field
    # and the CRUD service already hashes the password

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
    _record_membership_if_joining(
        db,
        user=user,
        current_user=current_user,
        joining_existing_team=joining_existing_team,
    )
    return user

@router.delete("/{user_id}", response_model=UserInDB)
def delete_user(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_admin_user),
    user_id: int,
) -> UserInDB:
    """
    Delete user.
    """
    
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


PROTECTED_ADMIN_EMAIL = "ali@the-leadlab.com"


class ModerateAccountsInput(BaseModel):
    user_ids: List[int] = Field(default_factory=list)
    action: Literal["deactivate", "delete"]
    confirm: bool = False


@router.post("/actions/moderate-accounts", response_model=dict)
def moderate_accounts(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_admin_user),
    body: ModerateAccountsInput,
) -> Any:
    """Deactivate or delete selected accounts. Requires explicit confirmation."""
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Confirmation is required")
    if not body.user_ids:
        raise HTTPException(status_code=400, detail="Select at least one account")
    if len(body.user_ids) > 200:
        raise HTTPException(status_code=400, detail="Too many accounts in one request")

    affected = 0
    skipped = 0
    for user_id in body.user_ids:
        user = crud_user.user.get(db, id=user_id)
        if not user:
            skipped += 1
            continue
        email = (user.email or "").strip().lower()
        if email == PROTECTED_ADMIN_EMAIL or int(user.id) == int(current_user.id):
            skipped += 1
            continue
        if body.action == "deactivate":
            user.is_active = False
            db.add(user)
            affected += 1
        else:
            crud_user.user.remove(db=db, id=user_id)
            affected += 1
    db.commit()
    return {
        "success": True,
        "action": body.action,
        "affected": affected,
        "skipped": skipped,
        "message": f"{body.action.title()}d {affected} account(s)",
    }


@router.post("/actions/deactivate-all-except-ali", response_model=dict)
@router.post("/actions/delete-all-except-ali", response_model=dict)
def delete_all_except_ali(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_admin_user),
) -> Any:
    """
    Permanently delete every user except ali@the-leadlab.com (and their dependent rows).
    Development only — this endpoint is disabled in production.
    """
    env = (getattr(settings, "ENV", "") or "").lower()
    if env not in ("development", "dev", "local", "test"):
        raise HTTPException(
            status_code=403,
            detail="This debug action is disabled outside development",
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
