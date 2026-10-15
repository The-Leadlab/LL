from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
from app.crud.base import CRUDBase
from app.models.activity import Activity
from app.schemas.activity import ActivityCreate, ActivityUpdate
from datetime import datetime, timedelta

class CRUDActivity(CRUDBase[Activity, ActivityCreate, ActivityUpdate]):
    def get_by_lead(self, db: Session, *, lead_id: int) -> List[Activity]:
        return db.query(Activity).filter(Activity.lead_id == lead_id).all()

    def get_by_user(self, db: Session, *, user_id: int) -> List[Activity]:
        return db.query(Activity).filter(Activity.user_id == user_id).all()

    def get(self, db: Session, activity_id: int) -> Optional[Activity]:
        return db.query(Activity).filter(Activity.id == activity_id).first()

    def get_multi(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        user_id: Optional[int] = None,
        lead_id: Optional[int] = None,
        activity_type: Optional[str] = None,
        sort_by: str = "created_at",
        sort_desc: bool = True
    ) -> List[Activity]:
        query = db.query(Activity)
        
        if user_id is not None:
            query = query.filter(Activity.user_id == user_id)
        if lead_id is not None:
            query = query.filter(Activity.lead_id == lead_id)
        if activity_type is not None:
            query = query.filter(Activity.type == activity_type)

        sort_column = sort_by if hasattr(Activity, sort_by) else "created_at"
        if not hasattr(Activity, sort_column):
            sort_column = "id"
        order = desc(getattr(Activity, sort_column)) if sort_desc else asc(getattr(Activity, sort_column))
        query = query.order_by(order)

        return query.offset(skip).limit(limit).all()

    def get_upcoming(
        self,
        db: Session,
        *,
        user_id: Optional[int] = None,
        days: int = 7,
    ) -> List[Activity]:
        now = datetime.utcnow()
        until = now + timedelta(days=days)
        query = db.query(Activity).filter(
            Activity.scheduled_at.isnot(None),
            Activity.scheduled_at >= now,
            Activity.scheduled_at <= until,
        )
        if user_id is not None:
            query = query.filter(Activity.user_id == user_id)
        return query.order_by(asc(Activity.scheduled_at)).all()

    def create(self, db: Session, *, obj_in: ActivityCreate) -> Activity:
        activity = Activity(
            type=obj_in.type,
            description=obj_in.description,
            scheduled_at=obj_in.scheduled_at,
            duration=getattr(obj_in, "duration", 0) or 0,
            lead_id=obj_in.lead_id,
            deal_id=getattr(obj_in, "deal_id", None),
            user_id=obj_in.user_id,
            organization_id=obj_in.organization_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(activity)
        db.commit()
        db.refresh(activity)
        return activity

    def update(self, db: Session, *, db_obj: Activity, obj_in: ActivityUpdate) -> Activity:
        update_data = obj_in.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def delete(self, db: Session, *, activity_id: int) -> Optional[Activity]:
        activity = self.get(db, activity_id=activity_id)
        if not activity:
            return None
            
        db.delete(activity)
        db.commit()
        return activity

    def get_recent_activities(
        self,
        db: Session,
        *,
        user_id: Optional[int] = None,
        lead_id: Optional[int] = None,
        days: int = 7,
        limit: int = 10
    ) -> List[Activity]:
        query = db.query(Activity)
        
        if user_id is not None:
            query = query.filter(Activity.user_id == user_id)
            
        if lead_id is not None:
            query = query.filter(Activity.lead_id == lead_id)
            
        cutoff_date = datetime.utcnow() - datetime.timedelta(days=days)
        query = query.filter(Activity.created_at >= cutoff_date)
        
        return query.order_by(desc(Activity.created_at)).limit(limit).all()

    def get_scheduled_activities(
        self,
        db: Session,
        *,
        user_id: Optional[int] = None,
        lead_id: Optional[int] = None
    ) -> List[Activity]:
        query = db.query(Activity).filter(
            Activity.scheduled_at >= datetime.utcnow(),
            Activity.completed_at.is_(None)
        )
        
        if user_id is not None:
            query = query.filter(Activity.user_id == user_id)
            
        if lead_id is not None:
            query = query.filter(Activity.lead_id == lead_id)
            
        return query.order_by(asc(Activity.scheduled_at)).all()

activity = CRUDActivity(Activity)

__all__ = ["activity"]
