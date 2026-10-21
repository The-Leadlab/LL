from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.orm import Session, defer
from app.api import deps
from app.crud import crud_task, crud_user
from app.models.user import User
from app.models.task import TaskStatus, TaskPriority
from app.models.task_attachment import TaskAttachment
from app.schemas.task import Task, TaskCreate, TaskUpdate, TaskList
from app.core.task_attachment_schema import ensure_task_attachments_schema
from app.services.assignment_notify import schedule_assignment_mention
import logging
from datetime import datetime
from pathlib import Path
import json
import uuid
import os
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(redirect_slashes=False)

TASK_ATTACHMENT_ROOT = Path(os.environ.get("TASK_ATTACHMENT_DIR") or "/tmp/leadlab_task_attachments")


def _ensure_attachment_table(db: Session) -> None:
    ensure_task_attachments_schema(db.get_bind())


def _row_to_item(row: TaskAttachment) -> dict:
    return {
        "filename": row.filename,
        "stored_name": row.stored_name,
        "size_bytes": int(row.size_bytes or 0),
        "content_type": row.content_type or "application/octet-stream",
        "uploaded_at": (row.uploaded_at or datetime.utcnow()).isoformat(),
    }


def _storage_error(exc: Exception) -> HTTPException:
    logger.exception("Task attachment storage failed: %s", exc)
    return HTTPException(
        status_code=503,
        detail=(
            "Task attachments could not be stored. Disk uploads are not available on this "
            "host (ephemeral/read-only filesystem). Database storage also failed — "
            f"{type(exc).__name__}: {exc}"
        ),
    )

@router.get("", response_model=TaskList)
@router.get("/", response_model=TaskList)
def get_tasks(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
) -> TaskList:
    """
    Retrieve tasks for current user's organization.
    """
    logger.info(f"User {current_user.id} requesting tasks for org {current_user.organization_id}")
    org_id = current_user.organization_id
    search_term = (search or "").strip() or None
    tasks = crud_task.task.get_multi(
        db,
        skip=skip,
        limit=limit,
        organization_id=org_id,
        search=search_term,
    )
    total = crud_task.task.count_multi(
        db,
        organization_id=org_id,
        search=search_term,
    )
    return TaskList(items=tasks, total=total)

@router.post("", response_model=Task)
@router.post("/", response_model=Task)
def create_task(
    *,
    db: Session = Depends(deps.get_db),
    background_tasks: BackgroundTasks,
    current_user: User = Depends(deps.get_current_user),
    task_in: TaskCreate,
) -> Any:
    """
    Create a new task.
    """
    # Always scope new tasks to the caller's workspace. Client-supplied org ids
    # previously created rows the creator could not read back.
    task_in.organization_id = current_user.organization_id
    if not task_in.assigned_to_id:
        task_in.assigned_to_id = current_user.id
    if task_in.assigned_to_id:
        assignee = crud_user.user.get(db, id=task_in.assigned_to_id)
        if not assignee or int(assignee.organization_id) != int(current_user.organization_id):
            raise HTTPException(status_code=400, detail="Assignee must be a member of your organization")
    
    # Create the task
    task = crud_task.task.create(db, obj_in=task_in)

    if task.assigned_to_id and int(task.assigned_to_id) != int(current_user.id):
        from app.services.notification_service import NotificationService
        org_name = getattr(getattr(current_user, "organization", None), "name", None)
        actor_name = (
            getattr(current_user, "full_name", None)
            or f"{(current_user.first_name or '').strip()} {(current_user.last_name or '').strip()}".strip()
            or current_user.email
            or "A teammate"
        )
        NotificationService.notify_task_assignment(
            db,
            assigned_user_id=task.assigned_to_id,
            task_title=task.title,
            task_id=task.id,
            assigned_by_user_name=actor_name,
            actor_id=current_user.id,
            commit=True,
        )
        schedule_assignment_mention(
            background_tasks,
            db=db,
            assignee_id=task.assigned_to_id,
            mentioner=current_user,
            entity_type="task",
            entity_id=task.id,
            entity_title=task.title,
            organization_name=org_name,
        )
    
    # Log activity for task creation
    try:
        # Create activity for task creation
        from app.models.activity import Activity, ActivityType
        
        # Determine related entity
        lead_id = task_in.lead_id if hasattr(task_in, 'lead_id') else None
        deal_id = task_in.deal_id if hasattr(task_in, 'deal_id') else None
        
        activity = Activity(
            type=ActivityType.TASK_CREATED,
            description=f"Task created: {task.title}",
            user_id=current_user.id,
            organization_id=task.organization_id,
            lead_id=lead_id,
            deal_id=deal_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(activity)
        db.commit()
    except Exception as e:
        # Log error but don't fail the request
        print(f"Error creating activity for task creation: {str(e)}")
    
    return task

@router.get("/{task_id}", response_model=Task)
@router.get("/{task_id}/", response_model=Task)
def get_task(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    task_id: int,
) -> Task:
    """
    Get task by ID.
    """
    logger.info(f"User {current_user.id} requesting task {task_id}")
    task = crud_task.task.get(db, task_id)
    if not task:
        logger.warning(f"Task {task_id} not found")
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Debug log to see what's happening
    logger.info(f"Task org_id: {task.organization_id}, User org_id: {current_user.organization_id}")
    
    # Check if task belongs to user's organization
    if task.organization_id != current_user.organization_id:
        logger.warning(f"Permission denied: Task {task_id} belongs to org {task.organization_id}, user is in org {current_user.organization_id}")
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    return task

@router.put("/{task_id}", response_model=Task)
def update_task(
    *,
    db: Session = Depends(deps.get_db),
    background_tasks: BackgroundTasks,
    current_user: User = Depends(deps.get_current_user),
    task_id: int,
    task_in: TaskUpdate,
) -> Any:
    """
    Update a task.
    """
    task = crud_task.task.get(db, task_id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if the user has permission to update this task
    if not current_user.is_admin and task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    previous_assignee_id = task.assigned_to_id
    update_fields = task_in.model_dump(exclude_unset=True) if hasattr(task_in, "model_dump") else task_in.dict(exclude_unset=True)
    new_assignee_id = update_fields.get("assigned_to_id", previous_assignee_id)
    if "assigned_to_id" in update_fields and new_assignee_id:
        assignee = crud_user.user.get(db, id=new_assignee_id)
        if not assignee or int(assignee.organization_id) != int(current_user.organization_id):
            raise HTTPException(status_code=400, detail="Assignee must be a member of your organization")
    
    # Check if task is being completed
    task_completed = False
    if task_in.status and task_in.status == "COMPLETED" and task.status != "COMPLETED":
        task_completed = True
    
    # Update the task
    task = crud_task.task.update(db, db_obj=task, obj_in=task_in)

    if (
        new_assignee_id
        and new_assignee_id != previous_assignee_id
        and int(new_assignee_id) != int(current_user.id)
    ):
        from app.services.notification_service import NotificationService
        org_name = getattr(getattr(current_user, "organization", None), "name", None)
        actor_name = (
            getattr(current_user, "full_name", None)
            or f"{(current_user.first_name or '').strip()} {(current_user.last_name or '').strip()}".strip()
            or current_user.email
            or "A teammate"
        )
        NotificationService.notify_task_assignment(
            db,
            assigned_user_id=new_assignee_id,
            task_title=task.title,
            task_id=task.id,
            assigned_by_user_name=actor_name,
            actor_id=current_user.id,
            commit=True,
        )
        schedule_assignment_mention(
            background_tasks,
            db=db,
            assignee_id=new_assignee_id,
            mentioner=current_user,
            entity_type="task",
            entity_id=task.id,
            entity_title=task.title,
            organization_name=org_name,
        )
    
    # Log activity for task update
    try:
        # Create activity for task update
        from app.models.activity import Activity, ActivityType
        
        # Determine related entity
        lead_id = task.lead_id if hasattr(task, 'lead_id') else None
        deal_id = task.deal_id if hasattr(task, 'deal_id') else None
        
        if task_completed:
            activity_type = ActivityType.TASK_COMPLETED
            description = f"Task completed: {task.title}"
        else:
            activity_type = ActivityType.NOTE
            description = f"Task updated: {task.title}"
        
        activity = Activity(
            type=activity_type,
            description=description,
            user_id=current_user.id,
            organization_id=task.organization_id,
            lead_id=lead_id,
            deal_id=deal_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(activity)
        db.commit()
    except Exception as e:
        # Log error but don't fail the request
        print(f"Error creating activity for task update: {str(e)}")
    
    return task

@router.delete("/{task_id}", response_model=Task)
def delete_task(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    task_id: int,
) -> Task:
    """
    Delete task.
    """
    task = crud_task.task.get(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    task = crud_task.task.remove(db, id=task_id)
    return task

@router.get("/overdue", response_model=List[Task])
def get_overdue_tasks(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> List[Task]:
    """
    Get overdue tasks.
    """
    if current_user.is_admin:
        user_id = None
    else:
        user_id = current_user.id
    
    return crud_task.task.get_overdue_tasks(db, user_id=user_id)

@router.get("/upcoming", response_model=List[Task])
def get_upcoming_tasks(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    days: int = Query(7, ge=1, le=30),
) -> List[Task]:
    """
    Get upcoming tasks for the next X days.
    """
    if current_user.is_admin:
        user_id = None
    else:
        user_id = current_user.id
    
    return crud_task.task.get_upcoming_tasks(db, user_id=user_id, days=days)

@router.post("/{task_id}/complete", response_model=Task)
def complete_task(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    task_id: int,
) -> Any:
    """
    Mark a task as completed.
    """
    task = crud_task.task.get(db, id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if the user has permission to update this task
    if not current_user.is_admin and task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Update the task status to completed
    from app.models.task import TaskStatus
    task_in = TaskUpdate(status=TaskStatus.COMPLETED)
    task = crud_task.task.update(db, db_obj=task, obj_in=task_in)
    
    # Log activity for task completion
    try:
        # Create activity for task completion
        from app.models.activity import Activity, ActivityType
        
        # Determine related entity
        lead_id = task.lead_id if hasattr(task, 'lead_id') else None
        deal_id = task.deal_id if hasattr(task, 'deal_id') else None
        
        activity = Activity(
            type=ActivityType.TASK_COMPLETED,
            description=f"Task completed: {task.title}",
            user_id=current_user.id,
            organization_id=task.organization_id,
            lead_id=lead_id,
            deal_id=deal_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(activity)
        db.commit()
    except Exception as e:
        # Log error but don't fail the request
        print(f"Error creating activity for task completion: {str(e)}")
    
    return task


@router.get("/{task_id}/attachments")
@router.get("/{task_id}/attachments/")
def list_task_attachments(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    task_id: int,
):
    task = crud_task.task.get(db, id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    try:
        _ensure_attachment_table(db)
        rows = (
            db.query(TaskAttachment)
            .options(defer(TaskAttachment.blob))
            .filter(
                TaskAttachment.task_id == task_id,
                TaskAttachment.organization_id == current_user.organization_id,
            )
            .order_by(TaskAttachment.uploaded_at.desc())
            .all()
        )
        return [_row_to_item(row) for row in rows]
    except HTTPException:
        raise
    except Exception as exc:
        raise _storage_error(exc)


@router.post("/{task_id}/attachments")
@router.post("/{task_id}/attachments/")
async def upload_task_attachment(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    task_id: int,
    file: UploadFile = File(...),
):
    task = crud_task.task.get(db, id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Attachment is empty")
    if len(content) > settings.MAX_UPLOAD_SIZE:
        logger.warning("Task attachment too large task=%s user=%s", task_id, current_user.id)
        raise HTTPException(status_code=413, detail="Attachment exceeds maximum upload size")

    safe_name = os.path.basename(file.filename or "attachment")
    stored_name = f"{uuid.uuid4().hex}_{safe_name}"
    try:
        _ensure_attachment_table(db)
        row = TaskAttachment(
            task_id=task_id,
            organization_id=current_user.organization_id,
            filename=safe_name,
            stored_name=stored_name,
            content_type=file.content_type or "application/octet-stream",
            size_bytes=len(content),
            blob=content,
            uploaded_at=datetime.utcnow(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _row_to_item(row)
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise _storage_error(exc)


@router.get("/{task_id}/attachments/{stored_name}")
def download_task_attachment(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    task_id: int,
    stored_name: str,
):
    task = crud_task.task.get(db, id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    try:
        _ensure_attachment_table(db)
        row = (
            db.query(TaskAttachment)
            .filter(
                TaskAttachment.task_id == task_id,
                TaskAttachment.stored_name == stored_name,
                TaskAttachment.organization_id == current_user.organization_id,
            )
            .first()
        )
    except Exception as exc:
        raise _storage_error(exc)
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")

    headers = {
        "Content-Disposition": f'attachment; filename="{row.filename or stored_name}"'
    }
    return Response(
        content=bytes(row.blob or b""),
        media_type=row.content_type or "application/octet-stream",
        headers=headers,
    )


@router.delete("/{task_id}/attachments/{stored_name}")
def delete_task_attachment(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    task_id: int,
    stored_name: str,
):
    task = crud_task.task.get(db, id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    try:
        _ensure_attachment_table(db)
        row = (
            db.query(TaskAttachment)
            .filter(
                TaskAttachment.task_id == task_id,
                TaskAttachment.stored_name == stored_name,
                TaskAttachment.organization_id == current_user.organization_id,
            )
            .first()
        )
        if not row:
            raise HTTPException(status_code=404, detail="Attachment not found")
        db.delete(row)
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise _storage_error(exc)

    return {"message": "Attachment deleted"}
