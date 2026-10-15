from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from app.api import deps
from app.crud.crud_activity import activity as crud_activity
from app.models.user import User
from app.models.activity import ActivityType, Activity as ActivityModel
from app.schemas.activity import Activity, ActivityCreate, ActivityUpdate, ActivityList
from fastapi import status

router = APIRouter(redirect_slashes=False)

_SORTABLE_COLUMNS = {"scheduled_at", "created_at", "updated_at", "completed_at"}


def _safe_sort_by(sort_by: str) -> str:
    if sort_by in _SORTABLE_COLUMNS and hasattr(ActivityModel, sort_by):
        return sort_by
    if hasattr(ActivityModel, "created_at"):
        return "created_at"
    return "id"


@router.get("", response_model=ActivityList)
@router.get("/", response_model=ActivityList)
def get_activities(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    lead_id: Optional[int] = None,
    activity_type: Optional[ActivityType] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_desc: bool = True,
) -> ActivityList:
    """
    Retrieve activities.
    """
    if lead_id is not None or current_user.is_admin:
        user_id = None  # Lead timeline is org-visible; admins see all
    else:
        user_id = current_user.id

    activities = crud_activity.get_multi(
        db,
        user_id=user_id,
        lead_id=lead_id,
        activity_type=activity_type,
        skip=skip,
        limit=limit,
        sort_by=_safe_sort_by(sort_by),
        sort_desc=sort_desc
    )
    total = len(activities)
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
    activity_in.user_id = current_user.id
    if not activity_in.organization_id:
        activity_in.organization_id = current_user.organization_id
    activity = crud_activity.create(db, obj_in=activity_in)
    return activity

@router.get("/upcoming/summary", response_model=List[Activity])
def get_upcoming_activities(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    days: int = Query(7, ge=1, le=30),
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
