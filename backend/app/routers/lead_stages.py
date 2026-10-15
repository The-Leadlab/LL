from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.lead_stage import LeadStage
from app.schemas.lead_stage import LeadStageResponse

router = APIRouter(redirect_slashes=False, 
    prefix="/lead-stages",
    tags=["lead_stages"]
)

@router.get("", response_model=List[LeadStageResponse])
@router.get("/", response_model=List[LeadStageResponse])
def get_lead_stages(db: Session = Depends(get_db)):
    """Get all lead stages ordered by order_index"""
    stages = db.query(LeadStage).filter(LeadStage.is_active == True).order_by(LeadStage.order_index).all()
    return stages
