from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from app.models.notification import Notification
from app.schemas.notification import NotificationCreate, NotificationResponse
from datetime import datetime, timezone
from pydantic import BaseModel

router = APIRouter(redirect_slashes=False)

# Response models
class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    link: Optional[str] = None
    action_url: Optional[str] = None
    is_read: bool
    created_at: datetime
    user_id: int
    type: Optional[str] = "info"
    priority: Optional[str] = "medium"
    
    class Config:
        from_attributes = True

class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    total: int

@router.get("/unread-count")
async def get_unread_count(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Lightweight badge count for the header bell."""
    from app.services.notification_service import NotificationService

    return {"count": NotificationService.unread_count(db, current_user.id)}


@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    limit: int = Query(default=10, le=200),
    skip: int = Query(default=0, ge=0),
    unread_only: bool = Query(default=False)
):
    """
    Get user notifications
    """
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    
    if unread_only:
        query = query.filter(Notification.is_read == False)
    
    notifications = query.order_by(Notification.created_at.desc()).offset(skip).limit(limit).all()
    return notifications

@router.put("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Mark notification as read
    """
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    db.commit()
    return {"status": "success"}

@router.put("/read-all")
async def mark_all_as_read(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Mark all notifications as read
    """
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    
    db.commit()
    return {"status": "success"}

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Delete a notification
    """
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    db.delete(notification)
    db.commit()
    return {"status": "success", "message": f"Notification {notification_id} deleted"}

@router.post("/test")
async def create_test_notification(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Create a test notification for the current user
    """
    from app.services.notification_service import NotificationService
    
    notification = NotificationService.create_notification(
        db=db,
        user_id=current_user.id,
        title="Test Notification",
        message="This is a test notification to verify the system is working!",
        link="/dashboard",
        notification_type="info",
        priority="medium"
    )
    
    return {"status": "success", "notification_id": notification.id}
