from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.crud.crud_client import client as crud_client
from app.schemas.client import Client, ClientCreate, ClientUpdate, ClientList

router = APIRouter()


def _to_schema(c, lead_counts: Optional[dict] = None) -> Client:
    data = Client.model_validate(c)
    if lead_counts is not None:
        data.lead_count = lead_counts.get(c.id, 0)
    return data


@router.get("", response_model=ClientList)
@router.get("/", response_model=ClientList)
def list_clients(
    include_archived: bool = Query(False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """List clients for the current organization."""
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    items = crud_client.list_for_org(
        db,
        organization_id=current_user.organization_id,
        include_archived=include_archived,
    )
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
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    # Ensure General exists first
    crud_client.ensure_general(db, organization_id=current_user.organization_id)
    created = crud_client.create(
        db, organization_id=current_user.organization_id, obj_in=body
    )
    return _to_schema(created, {created.id: 0})


@router.patch("/{client_id}", response_model=Client)
def rename_client(
    client_id: int,
    body: ClientUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    db_obj = crud_client.get_for_org(
        db, id=client_id, organization_id=current_user.organization_id
    )
    if not db_obj:
        raise HTTPException(status_code=404, detail="Client not found")
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
    db_obj = crud_client.get_for_org(
        db, id=client_id, organization_id=current_user.organization_id
    )
    if not db_obj:
        raise HTTPException(status_code=404, detail="Client not found")
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
    db_obj = crud_client.get_for_org(
        db, id=client_id, organization_id=current_user.organization_id
    )
    if not db_obj:
        raise HTTPException(status_code=404, detail="Client not found")
    updated = crud_client.restore(db, db_obj=db_obj)
    counts = crud_client.lead_counts_by_client(
        db, organization_id=current_user.organization_id
    )
    return _to_schema(updated, counts)
