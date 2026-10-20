from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from datetime import datetime

from app.api import deps
from app.models.user import User as UserModel
from app.models.organization import Organization
from app.crud.crud_team_invitation import team_invitation
from app.crud import crud_user
from app.schemas.team_invitation import (
    TeamInvitationCreate,
    TeamInvitationUpdate,
    TeamInvitation,
    TeamInvitationWithInviter,
    TeamInvitationToken,
    TeamInvitationAccept
)
from app.schemas.user import UserCreate
from app.core.email import email_sender
from app.core.config import settings
from app.core.user_language import get_user_language
from app.core.workspace import record_team_membership
from app import schemas
import logging

_optional_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False,
)

logger = logging.getLogger(__name__)

router = APIRouter(redirect_slashes=False)


def _optional_user_from_request(
    db: Session,
    token: Optional[str],
) -> Optional[UserModel]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        token_data = schemas.TokenPayload(**payload)
        if token_data.sub is None:
            return None
        return crud_user.user.get(db, id=int(token_data.sub))
    except (JWTError, ValueError, TypeError):
        return None


def _apply_invitation_role(user: UserModel, role: str) -> None:
    """Map invitation role onto the user record (admin vs member)."""
    if role == "admin":
        user.is_admin = True
        if hasattr(user, "role"):
            user.role = "admin"
    elif role in ("manager", "member", "viewer") and hasattr(user, "role"):
        # Keep non-admin invitees as standard users; org access is via organization_id
        if not user.is_admin:
            user.role = "user"


async def _send_invitation_email_or_raise(
    email: str,
    inviter_name: str,
    organization_name: str,
    invitation_link: str,
    role: str,
    message: str | None,
    language: str | None = None,
) -> None:
    """Send invitation email and raise when delivery fails."""
    try:
        sent = await email_sender.send_team_invitation(
            email,
            inviter_name,
            organization_name,
            invitation_link,
            role,
            message,
            language,
        )
        if not sent:
            raise RuntimeError("Invitation email delivery returned false")
    except Exception as exc:
        logger.exception(
            "Failed to send team invitation email",
            extra={
                "invite_email": email,
                "organization_name": organization_name,
                "role": role,
            },
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "Invitation created, but email delivery failed. "
                "Please verify SMTP/Resend configuration and try resending."
            )
        ) from exc

@router.post("", response_model=TeamInvitation)
@router.post("/", response_model=TeamInvitation)
async def create_team_invitation(
    *,
    db: Session = Depends(deps.get_db),
    background_tasks: BackgroundTasks,
    invitation_in: TeamInvitationCreate,
    current_user: UserModel = Depends(deps.get_current_user)
) -> Any:
    """
    Create a new team invitation.
    """
    try:
        # Only admins can invite users
        if not current_user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only administrators can invite team members"
            )
        
        # Get organization details
        organization = db.query(Organization).filter(
            Organization.id == current_user.organization_id
        ).first()
        
        if not organization:
            raise HTTPException(
                status_code=404,
                detail="Organization not found"
            )
        
        # Create invitation
        invitation = team_invitation.create_invitation(
            db=db,
            invitation_data=invitation_in,
            organization_id=current_user.organization_id,
            invited_by_id=current_user.id
        )
        
        # Send invitation email before returning success.
        invitation_link = f"{settings.FRONTEND_URL}/invite/{invitation.invitation_token}"
        inviter_name = f"{current_user.first_name} {current_user.last_name}".strip()

        await _send_invitation_email_or_raise(
            invitation.email,
            inviter_name,
            organization.name,
            invitation_link,
            invitation.role,
            invitation.message,
            get_user_language(db, current_user.id),
        )

        return invitation
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating invitation: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("", response_model=List[TeamInvitationWithInviter])
@router.get("/", response_model=List[TeamInvitationWithInviter])
def get_team_invitations(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
    status: str = None
) -> Any:
    """
    Get all team invitations for the current organization.
    """
    try:
        # Only admins can view invitations
        if not current_user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only administrators can view team invitations"
            )
        
        invitations = team_invitation.get_organization_invitations(
            db=db,
            organization_id=current_user.organization_id,
            status=status
        )
        
        # Transform to include inviter and organization names
        result = []
        for inv in invitations:
            # Get inviter name manually
            inviter = db.query(UserModel).filter(UserModel.id == inv.invited_by_id).first()
            inviter_name = f"{inviter.first_name} {inviter.last_name}".strip() if inviter else "Unknown"
            
            # Get organization name manually
            org = db.query(Organization).filter(Organization.id == inv.organization_id).first()
            org_name = org.name if org else "Unknown"
            
            result.append({
                **inv.__dict__,
                "invited_by_name": inviter_name,
                "organization_name": org_name
            })
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching invitations: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/token/{token}", response_model=TeamInvitationToken)
def get_invitation_by_token(
    *,
    db: Session = Depends(deps.get_db),
    token: str
) -> Any:
    """
    Get invitation details by token (public endpoint for accepting invitations).
    """
    try:
        invitation = team_invitation.get_by_token(db=db, token=token)
        
        if not invitation:
            raise HTTPException(
                status_code=404,
                detail="Invitation not found"
            )
        
        # Check if invitation is expired
        if invitation.expires_at < datetime.utcnow():
            invitation.status = "expired"
            db.commit()
            raise HTTPException(
                status_code=410,
                detail="Invitation has expired"
            )
        
        if invitation.status != "pending":
            raise HTTPException(
                status_code=400,
                detail=f"Invitation is {invitation.status} and cannot be accepted"
            )
        
        # Return public information only
        inviter = db.query(UserModel).filter(UserModel.id == invitation.invited_by_id).first()
        inviter_name = f"{inviter.first_name} {inviter.last_name}".strip() if inviter else "Unknown"
        
        org = db.query(Organization).filter(Organization.id == invitation.organization_id).first()
        org_name = org.name if org else "Unknown"
        existing_user = crud_user.user.get_by_email(db, email=invitation.email) is not None
        
        return TeamInvitationToken(
            id=invitation.id,
            email=invitation.email,
            first_name=invitation.first_name,
            last_name=invitation.last_name,
            role=invitation.role,
            organization_name=org_name,
            invited_by_name=inviter_name,
            status=invitation.status,
            expires_at=invitation.expires_at,
            message=invitation.message,
            existing_user=existing_user,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invitation by token: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/accept/{token}")
async def accept_team_invitation(
    *,
    db: Session = Depends(deps.get_db),
    background_tasks: BackgroundTasks,
    token: str,
    accept_data: TeamInvitationAccept,
    bearer: Optional[str] = Depends(_optional_oauth2),
) -> Any:
    """
    Accept a team invitation.

    New emails: create an account (password required).
    Existing emails: caller must be authenticated as that email; we move them
    into the inviting organization (no duplicate account).
    """
    try:
        invitation = team_invitation.get_by_token(db=db, token=token)
        
        if not invitation:
            raise HTTPException(
                status_code=404,
                detail="Invitation not found"
            )
        
        # Check if invitation is expired
        if invitation.expires_at < datetime.utcnow():
            invitation.status = "expired"
            db.commit()
            raise HTTPException(
                status_code=410,
                detail="Invitation has expired"
            )
        
        if invitation.status != "pending":
            raise HTTPException(
                status_code=400,
                detail=f"Invitation is {invitation.status} and cannot be accepted"
            )
        
        existing_user = crud_user.user.get_by_email(db, email=invitation.email)
        if existing_user:
            current_user = _optional_user_from_request(db, bearer)
            invite_email = (invitation.email or "").strip().lower()
            if not current_user:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "existing_user",
                        "message": (
                            "An account with this email already exists. "
                            "Sign in with that account to join the team."
                        ),
                        "email": invitation.email,
                    },
                )
            if (current_user.email or "").strip().lower() != invite_email:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "You are signed in as a different user. "
                        f"Sign in as {invitation.email} to accept this invitation."
                    ),
                )
            if int(existing_user.organization_id or 0) == int(invitation.organization_id):
                team_invitation.accept_invitation(db=db, invitation=invitation)
                return {
                    "message": "You are already a member of this organization",
                    "user_id": existing_user.id,
                }

            existing_user.organization_id = invitation.organization_id
            if accept_data.first_name:
                existing_user.first_name = accept_data.first_name
            if accept_data.last_name:
                existing_user.last_name = accept_data.last_name
            _apply_invitation_role(existing_user, invitation.role or "member")
            existing_user.is_active = True
            db.add(existing_user)
            db.commit()
            db.refresh(existing_user)
            record_team_membership(
                db,
                user=existing_user,
                organization_id=int(invitation.organization_id),
                invited_by_id=int(invitation.invited_by_id) if invitation.invited_by_id else None,
            )
            team_invitation.accept_invitation(db=db, invitation=invitation)
            return {
                "message": "Joined organization successfully",
                "user_id": existing_user.id,
            }

        if not accept_data.password or len(accept_data.password) < 8:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters",
            )

        # Create new user
        user_data = UserCreate(
            email=invitation.email,
            password=accept_data.password,
            first_name=accept_data.first_name or invitation.first_name or "",
            last_name=accept_data.last_name or invitation.last_name or "",
            organization_id=invitation.organization_id,
            is_active=True,
            is_admin=(invitation.role == "admin")
        )
        
        user = crud_user.user.create(db, obj_in=user_data)
        record_team_membership(
            db,
            user=user,
            organization_id=int(invitation.organization_id),
            invited_by_id=int(invitation.invited_by_id) if invitation.invited_by_id else None,
        )
        
        # Mark invitation as accepted
        team_invitation.accept_invitation(db=db, invitation=invitation)
        
        # Send welcome email (use inviter language preference as invitee default)
        login_link = f"{settings.FRONTEND_URL}/signin"
        inviter_lang = get_user_language(
            db,
            invitation.invited_by_id if invitation.invited_by_id else None,
        )
        background_tasks.add_task(
            email_sender.send_welcome_email,
            user.email,
            user.first_name,
            login_link,
            inviter_lang,
        )
        
        return {"message": "Invitation accepted successfully", "user_id": user.id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting invitation: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{invitation_id}", response_model=TeamInvitation)
def update_team_invitation(
    *,
    db: Session = Depends(deps.get_db),
    invitation_id: int,
    invitation_update: TeamInvitationUpdate,
    current_user: UserModel = Depends(deps.get_current_user)
) -> Any:
    """
    Update a team invitation (cancel, change role, etc).
    """
    try:
        # Only admins can update invitations
        if not current_user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only administrators can update team invitations"
            )
        
        invitation = team_invitation.get(db=db, id=invitation_id)
        if not invitation:
            raise HTTPException(
                status_code=404,
                detail="Invitation not found"
            )
        
        # Check if invitation belongs to current user's organization
        if invitation.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=403,
                detail="You can only update invitations from your organization"
            )
        
        updated_invitation = team_invitation.update(
            db=db,
            db_obj=invitation,
            obj_in=invitation_update
        )
        
        return updated_invitation
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating invitation: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/{invitation_id}/resend")
async def resend_team_invitation(
    *,
    db: Session = Depends(deps.get_db),
    background_tasks: BackgroundTasks,
    invitation_id: int,
    current_user: UserModel = Depends(deps.get_current_user)
) -> Any:
    """
    Resend a team invitation.
    """
    try:
        # Only admins can resend invitations
        if not current_user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only administrators can resend team invitations"
            )
        
        invitation = team_invitation.get(db=db, id=invitation_id)
        if not invitation:
            raise HTTPException(
                status_code=404,
                detail="Invitation not found"
            )
        
        # Check if invitation belongs to current user's organization
        if invitation.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=403,
                detail="You can only resend invitations from your organization"
            )
        
        # Resend invitation (updates token and expiration)
        updated_invitation = team_invitation.resend_invitation(db=db, invitation=invitation)
        
        # Send new invitation email before returning success.
        organization = db.query(Organization).filter(
            Organization.id == current_user.organization_id
        ).first()
        
        invitation_link = f"{settings.FRONTEND_URL}/invite/{updated_invitation.invitation_token}"
        inviter_name = f"{current_user.first_name} {current_user.last_name}".strip()
        
        await _send_invitation_email_or_raise(
            updated_invitation.email,
            inviter_name,
            organization.name,
            invitation_link,
            updated_invitation.role,
            updated_invitation.message,
            get_user_language(db, current_user.id),
        )
        
        return {"message": "Invitation resent successfully"}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resending invitation: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/{invitation_id}")
def cancel_team_invitation(
    *,
    db: Session = Depends(deps.get_db),
    invitation_id: int,
    current_user: UserModel = Depends(deps.get_current_user)
) -> Any:
    """
    Cancel a team invitation.
    """
    try:
        # Only admins can cancel invitations
        if not current_user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only administrators can cancel team invitations"
            )
        
        invitation = team_invitation.get(db=db, id=invitation_id)
        if not invitation:
            raise HTTPException(
                status_code=404,
                detail="Invitation not found"
            )
        
        # Check if invitation belongs to current user's organization
        if invitation.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=403,
                detail="You can only cancel invitations from your organization"
            )
        
        # Cancel invitation
        team_invitation.cancel_invitation(db=db, invitation=invitation)
        
        return {"message": "Invitation cancelled successfully"}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling invitation: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/stats", response_model=dict)
def get_invitation_stats(
    *,
    db: Session = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user)
) -> Any:
    """
    Get invitation statistics for the current organization.
    """
    try:
        # Only admins can view stats
        if not current_user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only administrators can view invitation statistics"
            )
        
        stats = team_invitation.get_invitation_stats(
            db=db,
            organization_id=current_user.organization_id
        )
        
        return stats
        
    except Exception as e:
        logger.error(f"Error fetching invitation stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error") 