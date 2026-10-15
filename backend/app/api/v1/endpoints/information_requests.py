from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app import crud, models, schemas
from app.api import deps

router = APIRouter(redirect_slashes=False, tags=["information-requests"])

@router.post("", response_model=schemas.InformationRequestResponse)
@router.post("/", response_model=schemas.InformationRequestResponse)
def create_information_request(
    *,
    db: Session = Depends(deps.get_db),
    request_in: schemas.InformationRequestCreate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new information request.
    """
    try:
        # Check if request already exists
        existing_request = db.query(models.InformationRequest).filter(
            models.InformationRequest.lead_id == request_in.lead_id,
            models.InformationRequest.field_name == request_in.field_name
        ).first()
        
        if existing_request:
            # Return existing request with status
            response_data = {
                "id": existing_request.id,
                "lead_id": existing_request.lead_id,
                "requested_by": existing_request.requested_by,
                "field_name": existing_request.field_name,
                "status": existing_request.status,
                "notes": existing_request.notes,
                "created_at": existing_request.created_at,
                "updated_at": existing_request.updated_at,
                "completed_at": existing_request.completed_at,
                "requester_name": existing_request.requester.full_name if existing_request.requester else None,
                "lead_name": existing_request.lead.full_name if existing_request.lead else None
            }
            return response_data
            
        # Create the request with current user as requester
        request_data = request_in.model_dump()
        request_data["requested_by"] = current_user.id
        
        info_request = crud.information_request.create(
            db=db,
            obj_in=request_data
        )
        
        # Add requester and lead names to response
        response_data = {
            "id": info_request.id,
            "lead_id": info_request.lead_id,
            "requested_by": info_request.requested_by,
            "field_name": info_request.field_name,
            "status": info_request.status,
            "notes": info_request.notes,
            "created_at": info_request.created_at,
            "updated_at": info_request.updated_at,
            "completed_at": info_request.completed_at,
            "requester_name": current_user.full_name,
            "lead_name": info_request.lead.full_name if info_request.lead else None
        }
        
        return response_data
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="An information request for this lead and field already exists"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/lead/{lead_id}", response_model=List[schemas.InformationRequestResponse])
def get_lead_requests(
    lead_id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get all information requests for a lead.
    """
    try:
        requests = crud.information_request.get_by_lead(db=db, lead_id=lead_id)
        response_data = []
        for request in requests:
            requester = getattr(request, "requester", None)
            lead = getattr(request, "lead", None)
            request_data = {
                "id": request.id,
                "lead_id": request.lead_id,
                "requested_by": request.requested_by,
                "field_name": request.field_name,
                "status": request.status,
                "notes": request.notes,
                "created_at": request.created_at,
                "updated_at": request.updated_at,
                "completed_at": request.completed_at,
                "requester_name": getattr(requester, "full_name", None) if requester else None,
                "lead_name": getattr(lead, "full_name", None) if lead else None,
            }
            response_data.append(request_data)
        return response_data
    except Exception:
        return []

@router.get("/me", response_model=List[schemas.InformationRequestResponse])
def get_my_requests(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get all information requests created by current user.
    """
    requests = crud.information_request.get_by_user(db=db, user_id=current_user.id)
    response_data = []
    for request in requests:
        request_data = {
            "id": request.id,
            "lead_id": request.lead_id,
            "requested_by": request.requested_by,
            "field_name": request.field_name,
            "status": request.status,
            "notes": request.notes,
            "created_at": request.created_at,
            "updated_at": request.updated_at,
            "completed_at": request.completed_at,
            "requester_name": request.requester.full_name if request.requester else None,
            "lead_name": request.lead.full_name if request.lead else None
        }
        response_data.append(request_data)
    return response_data

@router.get("/all", response_model=List[schemas.InformationRequestResponse])
def get_all_requests(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get all information requests (admin only).
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions"
        )

    requests = crud.information_request.get_all(db=db)
    response_data = []
    for request in requests:
        request_data = {
            "id": request.id,
            "lead_id": request.lead_id,
            "requested_by": request.requested_by,
            "field_name": request.field_name,
            "status": request.status,
            "notes": request.notes,
            "created_at": request.created_at,
            "updated_at": request.updated_at,
            "completed_at": request.completed_at,
            "requester_name": request.requester.full_name if request.requester else None,
            "lead_name": request.lead.full_name if request.lead else None
        }
        response_data.append(request_data)
    return response_data

@router.patch("/{request_id}", response_model=schemas.InformationRequestResponse)
@router.put("/{request_id}/status", response_model=schemas.InformationRequestResponse)
async def update_request_status(
    *,
    request_id: int,
    status_update: schemas.InformationRequestUpdate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Update information request status (admin only).
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions"
        )
    
    request = crud.information_request.get(db=db, id=request_id)
    if not request:
        raise HTTPException(
            status_code=404,
            detail="Information request not found"
        )
    
    # Update the request
    request = crud.information_request.update(
        db=db,
        db_obj=request,
        obj_in=status_update
    )
    
    # Return updated request with additional info
    return {
        "id": request.id,
        "lead_id": request.lead_id,
        "requested_by": request.requested_by,
        "field_name": request.field_name,
        "status": request.status,
        "notes": request.notes,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
        "completed_at": request.completed_at,
        "requester_name": request.requester.full_name if request.requester else None,
        "lead_name": request.lead.full_name if request.lead else None
    }
