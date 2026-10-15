from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import crud, schemas
from app.api import deps

router = APIRouter(redirect_slashes=False)

@router.get("", response_model=List[schemas.LeadStage])
@router.get("/", response_model=List[schemas.LeadStage])
@router.get("", response_model=List[schemas.LeadStage])
def read_lead_stages(
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Retrieve lead stages.
    """
    lead_stages = crud.lead_stage.get_multi(db)
    return lead_stages

@router.post("", response_model=schemas.LeadStage)
@router.post("/", response_model=schemas.LeadStage)
@router.post("", response_model=schemas.LeadStage)
def create_lead_stage(
    lead_stage_in: schemas.LeadStageCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Create new lead stage.
    """
    lead_stage = crud.lead_stage.create(db, obj_in=lead_stage_in)
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
