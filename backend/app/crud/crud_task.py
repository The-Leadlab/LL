from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import asc, desc, and_, or_
from datetime import datetime, timedelta
from app.crud.base import CRUDBase
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate

class CRUDTask(CRUDBase[Task, TaskCreate, TaskUpdate]):
    def get(
        self,
        db: Session,
        id: Optional[int] = None,
        task_id: Optional[int] = None,
    ) -> Optional[Task]:
        # Accept both `id=` (CRUDBase / attachment routes) and `task_id=` (legacy callers).
        tid = id if id is not None else task_id
        if tid is None:
            return None
        return (
            db.query(Task)
            .options(joinedload(Task.assigned_to), joinedload(Task.lead))
            .filter(Task.id == tid)
            .first()
        )

    def get_multi(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        organization_id: Optional[int] = None,
        user_id: Optional[int] = None,
        search: Optional[str] = None,
    ) -> List[Task]:
        # List views only need assignee; full lead is loaded on task detail.
        query = db.query(Task).options(joinedload(Task.assigned_to))
        if organization_id:
            query = query.filter(Task.organization_id == organization_id)
        if user_id:
            query = query.filter(Task.assigned_to_id == user_id)
        if search:
            needle = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Task.title.ilike(needle),
                    Task.description.ilike(needle),
                )
            )
        return query.order_by(desc(Task.created_at)).offset(skip).limit(limit).all()

    def count_multi(
        self,
        db: Session,
        *,
        organization_id: Optional[int] = None,
        user_id: Optional[int] = None,
        search: Optional[str] = None,
    ) -> int:
        from sqlalchemy import func as sa_func

        query = db.query(sa_func.count(Task.id))
        if organization_id:
            query = query.filter(Task.organization_id == organization_id)
        if user_id:
            query = query.filter(Task.assigned_to_id == user_id)
        if search:
            needle = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Task.title.ilike(needle),
                    Task.description.ilike(needle),
                )
            )
        return int(query.scalar() or 0)

    def get_by_lead(self, db: Session, *, lead_id: int) -> List[Task]:
        return db.query(Task)\
            .options(joinedload(Task.assigned_to))\
            .options(joinedload(Task.lead))\
            .filter(Task.lead_id == lead_id)\
            .all()

    def get_by_user(self, db: Session, *, user_id: int) -> List[Task]:
        return db.query(Task)\
            .options(joinedload(Task.assigned_to))\
            .options(joinedload(Task.lead))\
            .filter(Task.assigned_to_id == user_id)\
            .all()

    def get_by_status(self, db: Session, *, status: str) -> List[Task]:
        return db.query(Task)\
            .options(joinedload(Task.assigned_to))\
            .options(joinedload(Task.lead))\
            .filter(Task.status == status)\
            .all()

    def get_overdue_tasks(self, db: Session, user_id: Optional[int] = None) -> List[Task]:
        query = db.query(Task).filter(
            and_(
                Task.due_date < datetime.utcnow(),
                Task.status.in_(["PENDING", "IN_PROGRESS"])
            )
        )
        if user_id:
            query = query.filter(Task.assigned_to_id == user_id)
        return query.all()

    def get_upcoming_tasks(self, db: Session, user_id: Optional[int] = None, days: int = 7) -> List[Task]:
        query = db.query(Task).filter(
            and_(
                Task.due_date >= datetime.utcnow(),
                Task.due_date <= datetime.utcnow() + timedelta(days=days),
                Task.status.in_(["PENDING", "IN_PROGRESS"])
            )
        )
        if user_id:
            query = query.filter(Task.assigned_to_id == user_id)
        return query.all()

    def create(self, db: Session, *, obj_in: TaskCreate) -> Task:
        # Task model has no deal_id / created_by; TaskCreate has no those fields.
        db_obj = Task(
            title=obj_in.title,
            description=obj_in.description,
            due_date=obj_in.due_date,
            priority=obj_in.priority,
            status=obj_in.status,
            assigned_to_id=obj_in.assigned_to_id,
            organization_id=obj_in.organization_id,
            lead_id=obj_in.lead_id,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(self, db: Session, *, db_obj: Task, obj_in: TaskUpdate) -> Task:
        update_data = obj_in.dict(exclude_unset=True)
        
        # Status değişiyorsa ve COMPLETED olarak işaretleniyorsa, completed_at'i güncelle
        if "status" in update_data and update_data["status"] == "COMPLETED":
            update_data["completed_at"] = datetime.utcnow()
        
        for field in update_data:
            setattr(db_obj, field, update_data[field])
        
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

task = CRUDTask(Task)

__all__ = ["task"]
