from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from app import crud, models, schemas
from app.api import deps
from datetime import datetime
from app.services.linkedin_service import linkedin_service

router = APIRouter(redirect_slashes=False)

@router.get("", response_model=schemas.CommunicationList)
@router.get("/", response_model=schemas.CommunicationList)
def read_communications(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(deps.get_current_active_user),
    type: Optional[str] = None,
    status: Optional[str] = None,
    lead_id: Optional[int] = None,
    deal_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> Any:
    """
    İletişim kayıtlarını listele.
    """
    filters = {
        "type": type,
        "status": status,
        "lead_id": lead_id,
        "deal_id": deal_id,
        "date_from": date_from,
        "date_to": date_to
    }
    
    if current_user.is_superuser:
        communications = crud.communication.get_multi_by_organization(
            db,
            organization_id=current_user.organization_id,
            skip=skip,
            limit=limit,
            filters=filters
        )
        total = len(communications)  # TODO: Optimize this with a count query
    else:
        communications = crud.communication.get_multi_by_owner(
            db,
            user_id=current_user.id,
            skip=skip,
            limit=limit,
            filters=filters
        )
        total = len(communications)  # TODO: Optimize this with a count query
    
    return {
        "items": communications,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.post("", response_model=schemas.Communication)
@router.post("/", response_model=schemas.Communication)
def create_communication(
    *,
    db: Session = Depends(deps.get_db),
    communication_in: schemas.CommunicationCreate,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Yeni iletişim kaydı oluştur.
    """
    # Kullanıcının bu lead'e erişim izni var mı kontrol et
    lead = crud.lead.get(db=db, id=communication_in.lead_id)
    if not lead or lead.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Deal ID varsa, deal'e erişim izni var mı kontrol et
    if communication_in.deal_id:
        deal = crud.deal.get(db=db, id=communication_in.deal_id)
        if not deal or deal.organization_id != current_user.organization_id:
            raise HTTPException(status_code=404, detail="Deal not found")
    
    communication = crud.communication.create_with_owner(
        db=db,
        obj_in=communication_in,
        user_id=current_user.id
    )
    return communication

@router.put("/{id}", response_model=schemas.Communication)
def update_communication(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    communication_in: schemas.CommunicationUpdate,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    İletişim kaydını güncelle.
    """
    communication = crud.communication.get(db=db, id=id)
    if not communication:
        raise HTTPException(status_code=404, detail="Communication not found")
    
    if communication.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if not current_user.is_superuser and communication.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Deal ID varsa, deal'e erişim izni var mı kontrol et
    if communication_in.deal_id:
        deal = crud.deal.get(db=db, id=communication_in.deal_id)
        if not deal or deal.organization_id != current_user.organization_id:
            raise HTTPException(status_code=404, detail="Deal not found")
    
    communication = crud.communication.update(
        db=db,
        db_obj=communication,
        obj_in=communication_in
    )
    return communication

@router.get("/{id}", response_model=schemas.Communication)
def read_communication(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    İletişim kaydını getir.
    """
    communication = crud.communication.get(db=db, id=id)
    if not communication:
        raise HTTPException(status_code=404, detail="Communication not found")
    
    if communication.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if not current_user.is_superuser and communication.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    return communication

@router.delete("/{id}", response_model=schemas.Communication)
def delete_communication(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    İletişim kaydını sil.
    """
    communication = crud.communication.get(db=db, id=id)
    if not communication:
        raise HTTPException(status_code=404, detail="Communication not found")
    
    if communication.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if not current_user.is_superuser and communication.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    communication = crud.communication.remove(db=db, id=id)
    return communication

@router.post("/linkedin/auth")
async def linkedin_auth(
    code: str = Body(...),
    current_user: models.User = Depends(deps.get_current_active_user),
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    LinkedIn OAuth callback handler
    """
    try:
        # Exchange authorization code for access token
        token_data = await linkedin_service.get_access_token(code)
        
        # Get user's LinkedIn profile
        profile = await linkedin_service.get_profile(token_data["access_token"])
        
        # Update user's LinkedIn credentials
        crud.user.update(
            db=db,
            db_obj=current_user,
            obj_in={
                "linkedin_access_token": token_data["access_token"],
                "linkedin_profile_id": profile["id"]
            }
        )
        
        return {"message": "LinkedIn authentication successful"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/linkedin/message/{lead_id}")
async def send_linkedin_message(
    lead_id: int,
    message: str = Body(..., embed=True),
    current_user: models.User = Depends(deps.get_current_active_user),
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Send LinkedIn message to a lead
    """
    # Get lead
    lead = crud.lead.get(db=db, id=lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    if not lead.linkedin:
        raise HTTPException(status_code=400, detail="Lead has no LinkedIn profile")
        
    if not current_user.linkedin_access_token:
        raise HTTPException(
            status_code=401,
            detail="Please authenticate with LinkedIn first"
        )
        
    try:
        # Send message
        result = await linkedin_service.send_message(
            access_token=current_user.linkedin_access_token,
            recipient_id=lead.linkedin.split("/")[-1],  # Extract LinkedIn ID from URL
            message=message
        )
        
        # Log communication
        crud.communication.create(
            db=db,
            obj_in=schemas.CommunicationCreate(
                type="linkedin",
                lead_id=lead_id,
                content=message,
                status="sent",
                user_id=current_user.id,
                organization_id=current_user.organization_id
            )
        )
        
        return {"message": "LinkedIn message sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
