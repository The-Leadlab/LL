from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import crud, schemas
from app.api import deps
from app.models.lead_stage import LeadStage
from app.models.user import User

router = APIRouter(redirect_slashes=False)

@router.get("", response_model=List[schemas.LeadStage])
@router.get("/", response_model=List[schemas.LeadStage])
def read_lead_stages(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve active lead stages for the caller's organization (deduped by name).
    """
    rows = (
        db.query(LeadStage)
        .filter(
            LeadStage.organization_id == current_user.organization_id,
            LeadStage.is_active == True,  # noqa: E712
        )
        .order_by(LeadStage.order_index.asc(), LeadStage.id.asc())
        .all()
    )
    seen = set()
    unique: List[LeadStage] = []
    for stage in rows:
        key = (stage.name or "").strip().lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(stage)
    return unique

@router.post("", response_model=schemas.LeadStage)
@router.post("/", response_model=schemas.LeadStage)
def create_lead_stage(
    lead_stage_in: schemas.LeadStageCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new lead stage for the caller's organization.
    """
    payload = lead_stage_in.model_dump() if hasattr(lead_stage_in, "model_dump") else lead_stage_in.dict()
    payload["organization_id"] = current_user.organization_id
    lead_stage = crud.lead_stage.create(db, obj_in=schemas.LeadStageCreate(**payload))
    return lead_stage

@router.put("/{lead_stage_id}", response_model=schemas.LeadStage)
def update_lead_stage(
    lead_stage_id: int,
    lead_stage_in: schemas.LeadStageUpdate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Update a lead stage.
    """
    lead_stage = crud.lead_stage.get(db, id=lead_stage_id)
    if not lead_stage:
        raise HTTPException(status_code=404, detail="Lead stage not found")
    lead_stage = crud.lead_stage.update(db, db_obj=lead_stage, obj_in=lead_stage_in)
    return lead_stage

@router.delete("/{lead_stage_id}", response_model=schemas.LeadStage)
def delete_lead_stage(
    lead_stage_id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Delete a lead stage.
    """
    lead_stage = crud.lead_stage.get(db, id=lead_stage_id)
    if not lead_stage:
        raise HTTPException(status_code=404, detail="Lead stage not found")
    lead_stage = crud.lead_stage.remove(db, id=lead_stage_id)
    return lead_stage
