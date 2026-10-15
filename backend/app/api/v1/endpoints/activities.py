from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from app.api import deps
from app.crud import crud_activity
from app.models.user import User
from app.models.activity import ActivityType
from app.schemas.activity import Activity, ActivityCreate, ActivityUpdate, ActivityList
from fastapi import status

router = APIRouter(redirect_slashes=False)

@router.get("", response_model=ActivityList)
@router.get("/", response_model=ActivityList)
def get_activities(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    lead_id: Optional[int] = None,
    activity_type: Optional[ActivityType] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    sort_by: str = Query("scheduled_at", regex="^(scheduled_at|created_at|completed_at)$"),
    sort_desc: bool = True,
) -> ActivityList:
    """
    Retrieve activities.
    """
    if current_user.is_admin:
        user_id = None  # Admin can see all activities
    else:
        user_id = current_user.id

    activities = crud_activity.get_multi(
        db,
        user_id=user_id,
        lead_id=lead_id,
        activity_type=activity_type,
        skip=skip,
        limit=limit,
        sort_by=sort_by,
        sort_desc=sort_desc
    )
    total = len(activities)  # In real app, you should use count query
    return ActivityList(items=activities, total=total)

@router.post("", response_model=Activity)
@router.post("/", response_model=Activity)
def create_activity(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    activity_in: ActivityCreate,
) -> Activity:
    """
    Create new activity.
    """
    # Override user_id with current user's ID
    activity_in.user_id = current_user.id
    activity = crud_activity.create(db, obj_in=activity_in)
    return activity

@router.get("/{activity_id}", response_model=Activity)
def get_activity(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    activity_id: int,
) -> Activity:
    """
    Get activity by ID.
    """
    activity = crud_activity.get(db, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not current_user.is_admin and activity.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return activity

@router.put("/{activity_id}", response_model=Activity)
def update_activity(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    activity_id: int,
    activity_in: ActivityUpdate,
) -> Activity:
    """
    Update activity.
    """
    activity = crud_activity.get(db, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not current_user.is_admin and activity.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    activity = crud_activity.update(db, db_obj=activity, obj_in=activity_in)
    return activity

@router.delete("/{activity_id}", response_model=None, status_code=204)
def delete_activity(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    activity_id: int,
) -> Response:
    """
    Delete an activity.
    """
    activity = crud_activity.get(db, activity_id=activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not current_user.is_admin and activity.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    crud_activity.delete(db, activity_id=activity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/upcoming/summary", response_model=List[Activity])
def get_upcoming_activities(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    days: int = Query(7, ge=1, le=30),  # Default to next 7 days, max 30 days
) -> List[Activity]:
    """
    Get upcoming activities for the next X days.
    """
    if current_user.is_admin:
        user_id = None
    else:
        user_id = current_user.id
    
    activities = crud_activity.get_upcoming(
        db,
        user_id=user_id,
        days=days
    )
    return activities
