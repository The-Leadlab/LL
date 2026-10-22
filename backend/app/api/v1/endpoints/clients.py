from typing import Any, List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.models.user import User
from app.crud.crud_client import client as crud_client
from app.schemas.client import Client, ClientCreate, ClientUpdate, ClientList, ClientAssign
from app.core.email import email_sender
from app.core.config import settings
from app.core.user_language import get_user_language

router = APIRouter(redirect_slashes=False)


def _display_name(u: Optional[User]) -> Optional[str]:
    if not u:
        return None
    name = f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip()
    return name or (u.email or None)


def _to_schema(c, lead_counts: Optional[dict] = None) -> Client:
    data = Client.model_validate(c)
    if lead_counts is not None:
        data.lead_count = lead_counts.get(c.id, 0)
    assignee = getattr(c, "assignee", None)
    if assignee is not None:
        data.assigned_user_name = _display_name(assignee)
    return data


def _org_admins(db: Session, organization_id: int) -> List[User]:
    return (
        db.query(User)
        .filter(
            User.organization_id == organization_id,
            User.is_active == True,  # noqa: E712
            User.role == "admin",
        )
        .all()
    )


def _member_can_see(c, user: User) -> bool:
    if user.is_admin:
        return True
    if c.is_default:
        return True
    if c.assigned_user_id is None:
        return True
    if c.assigned_user_id == user.id:
        return True
    if c.created_by == user.id:
        return True
    return False


def _require_client(db: Session, client_id: int, user: User):
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    from app.models.client import Client as ClientModel

    db_obj = (
        db.query(ClientModel)
        .options(joinedload(ClientModel.assignee))
        .filter(
            ClientModel.id == client_id,
            ClientModel.organization_id == user.organization_id,
        )
        .first()
    )
    if not db_obj:
        raise HTTPException(status_code=404, detail="Client not found")
    if not _member_can_see(db_obj, user):
        raise HTTPException(status_code=404, detail="Client not found")
    return db_obj


@router.get("", response_model=ClientList)
@router.get("/", response_model=ClientList)
def list_clients(
    include_archived: bool = Query(False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """List clients for the current organization (filtered for non-admins)."""
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    from app.models.client import Client as ClientModel

    items = crud_client.list_for_org(
        db,
        organization_id=current_user.organization_id,
        include_archived=include_archived,
        viewer_user_id=current_user.id,
        viewer_is_admin=bool(current_user.is_admin),
    )
    # Re-load with assignee for display names
    ids = [c.id for c in items]
    if ids:
        loaded = (
            db.query(ClientModel)
            .options(joinedload(ClientModel.assignee))
            .filter(ClientModel.id.in_(ids))
            .all()
        )
        by_id = {c.id: c for c in loaded}
        items = [by_id[c.id] for c in items if c.id in by_id]
    counts = crud_client.lead_counts_by_client(
        db, organization_id=current_user.organization_id
    )
    return ClientList(
        items=[_to_schema(c, counts) for c in items],
        total=len(items),
    )


@router.post("", response_model=Client)
@router.post("/", response_model=Client)
def create_client(
    body: ClientCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Any team member can create a client list; it is assigned to them by default."""
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    crud_client.ensure_general(db, organization_id=current_user.organization_id)
    created = crud_client.create(
        db,
        organization_id=current_user.organization_id,
        obj_in=body,
        created_by=current_user.id,
        assigned_user_id=current_user.id,
    )
    return _to_schema(created, {created.id: 0})


@router.patch("/{client_id}", response_model=Client)
def rename_client(
    client_id: int,
    body: ClientUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    db_obj = _require_client(db, client_id, current_user)
    updated = crud_client.rename(db, db_obj=db_obj, obj_in=body)
    counts = crud_client.lead_counts_by_client(
        db, organization_id=current_user.organization_id
    )
    return _to_schema(updated, counts)


@router.post("/{client_id}/archive", response_model=Client)
def archive_client(
    client_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Any member who can see the list may archive it (except General)."""
    db_obj = _require_client(db, client_id, current_user)
    updated = crud_client.archive(db, db_obj=db_obj)
    counts = crud_client.lead_counts_by_client(
        db, organization_id=current_user.organization_id
    )
    return _to_schema(updated, counts)


@router.post("/{client_id}/restore", response_model=Client)
def restore_client(
    client_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    db_obj = _require_client(db, client_id, current_user)
    updated = crud_client.restore(db, db_obj=db_obj)
    counts = crud_client.lead_counts_by_client(
        db, organization_id=current_user.organization_id
    )
    return _to_schema(updated, counts)


@router.post("/{client_id}/assign", response_model=Client)
def assign_client(
    client_id: int,
    body: ClientAssign,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Admin-only: assign a client list to a team member (null = shared with org)."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only admins can assign client lists to team members",
        )
    db_obj = _require_client(db, client_id, current_user)
    assignee_id = body.assigned_user_id
    if assignee_id is not None:
        member = (
            db.query(User)
            .filter(
                User.id == assignee_id,
                User.organization_id == current_user.organization_id,
                User.is_active == True,  # noqa: E712
            )
            .first()
        )
        if not member:
            raise HTTPException(
                status_code=400,
                detail="Assignee must be an active member of your organization",
            )
    updated = crud_client.assign(db, db_obj=db_obj, assigned_user_id=assignee_id)
    # Refresh assignee relationship for response
    from app.models.client import Client as ClientModel

    refreshed = (
        db.query(ClientModel)
        .options(joinedload(ClientModel.assignee))
        .filter(ClientModel.id == updated.id)
        .first()
    )
    counts = crud_client.lead_counts_by_client(
        db, organization_id=current_user.organization_id
    )
    return _to_schema(refreshed or updated, counts)


@router.post("/{client_id}/request-delete")
def request_delete_client(
    client_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Non-admins: request permanent deletion. Emails org admins.
    Admins should use DELETE instead.
    """
    if current_user.is_admin:
        raise HTTPException(
            status_code=400,
            detail="Admins can delete client lists directly; use DELETE",
        )
    db_obj = _require_client(db, client_id, current_user)
    if db_obj.is_default:
        raise HTTPException(status_code=400, detail="The General client cannot be deleted")

    counts = crud_client.lead_counts_by_client(
        db, organization_id=current_user.organization_id
    )
    lead_count = counts.get(db_obj.id, 0)
    requester = _display_name(current_user) or current_user.email or "A team member"
    admins = _org_admins(db, current_user.organization_id)
    if not admins:
        raise HTTPException(
            status_code=400,
            detail="No admin found in your organization to approve this request",
        )

    frontend = (settings.FRONTEND_URL or "https://the-leadlab.com").rstrip("/")
    action_url = f"{frontend}/leads?client_id={db_obj.id}"
    client_name = db_obj.name
    requester_email = current_user.email or ""

    for admin in admins:
        lang = get_user_language(db, admin.id, fallback="en")
        if str(lang).lower().startswith("fr"):
            subject = f"Demande de suppression : « {client_name} »"
            message = (
                f"{requester} ({requester_email}) demande la suppression définitive "
                f"du client « {client_name} » ({lead_count} lead(s)). "
                f"Connectez-vous à LeadLab pour archiver ou supprimer cette liste."
            )
        else:
            subject = f"Delete request: “{client_name}”"
            message = (
                f"{requester} ({requester_email}) requested permanent deletion of "
                f"client “{client_name}” ({lead_count} lead(s)). "
                f"Sign in to LeadLab to archive or delete this list."
            )

        background_tasks.add_task(
            email_sender.send_notification_alert,
            to_email=admin.email,
            title=subject,
            message=message,
            action_url=action_url,
            recipient_name=_display_name(admin),
            language=lang,
        )

    return {
        "status": "success",
        "message": "Delete request sent to your organization admins",
        "client_id": db_obj.id,
        "client_name": client_name,
        "admins_notified": len(admins),
    }


@router.delete("/{client_id}")
def delete_client(
    client_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Permanently delete a client and soft-delete all of its leads.
    Admin-only. Non-admins should use POST /request-delete.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only admins can permanently delete client lists. Request deletion instead.",
        )
    db_obj = _require_client(db, client_id, current_user)
    result = crud_client.delete_with_leads(db, db_obj=db_obj)
    return {
        "status": "success",
        "message": (
            f"Deleted client '{result['client_name']}' and "
            f"{result['deleted_leads']} lead(s)"
        ),
        **result,
    }
