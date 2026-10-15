from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.api.deps import get_db, get_current_user
from app.services.info_request_service import InfoRequestService
from app.schemas.info_request import (
    InfoRequestCreate,
    InfoRequestUpdate,
    InfoRequestResponse
)
from app.models.info_request import RequestStatus

router = APIRouter(redirect_slashes=False)

@router.post("", response_model=InfoRequestResponse)
def create_info_request(
    request: InfoRequestCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return InfoRequestService.create_request(db, request, current_user.id)

@router.get("", response_model=List[InfoRequestResponse])
def get_info_requests(
    lead_id: Optional[int] = None,
    status: Optional[RequestStatus] = None,
    assigned_to: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return InfoRequestService.get_requests(db, lead_id, status, assigned_to)

@router.get("/{request_id}", response_model=InfoRequestResponse)
def get_info_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    request = InfoRequestService.get_request_by_id(db, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Info request not found")
    return request

@router.put("/{request_id}", response_model=InfoRequestResponse)
def update_info_request(
    request_id: int,
    update_data: InfoRequestUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    request = InfoRequestService.update_request(db, request_id, update_data)
    if not request:
        raise HTTPException(status_code=404, detail="Info request not found")
    return request

@router.delete("/{request_id}")
def delete_info_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if not InfoRequestService.delete_request(db, request_id):
        raise HTTPException(status_code=404, detail="Info request not found")
    return {"message": "Info request deleted successfully"}
