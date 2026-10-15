from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.crud import crud_note
from app.schemas.note import NoteCreate, NoteUpdate, Note as NoteSchema, NoteList

router = APIRouter(redirect_slashes=False)

@router.get("", response_model=NoteList)
@router.get("/", response_model=NoteList)
async def get_notes(
    organization_id: Optional[int] = Query(None, description="Organization ID"),
    lead_id: Optional[int] = Query(None, description="Lead ID"),
    deal_id: Optional[int] = Query(None, description="Deal ID"),
    skip: int = Query(0, description="Skip N records"),
    limit: int = Query(100, description="Limit N records"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get notes with filters and pagination"""
    filters = {
        "organization_id": organization_id or current_user.organization_id,
    }
    # Lead/deal note threads are shared with the org; only personal lists hide others' notes.
    if not lead_id and not deal_id and not current_user.is_admin:
        filters["created_by_id"] = current_user.id
    
    if lead_id:
        filters["lead_id"] = lead_id
    if deal_id:
        filters["deal_id"] = deal_id

    notes = crud_note.note.get_multi(
        db=db,
        filters=filters,
        skip=skip,
        limit=limit
    )
    total = crud_note.note.count(db=db, filters=filters)
    
    return {
        "items": notes,
        "total": total
    }

@router.post("", response_model=NoteSchema)
@router.post("/", response_model=NoteSchema)
async def create_note(
    note_in: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new note"""
    try:
        payload = note_in.model_dump(exclude_unset=True)
        payload["created_by_id"] = current_user.id
        payload["organization_id"] = current_user.organization_id
        note = crud_note.note.create(db=db, obj_in=NoteCreate(**payload))
        try:
            from app.crud.crud_activity import activity as crud_activity
            from app.models.activity import ActivityType
            from app.schemas.activity import ActivityCreate
            crud_activity.create(
                db,
                obj_in=ActivityCreate(
                    type=ActivityType.NOTE,
                    description=(payload.get("content") or "")[:500],
                    user_id=current_user.id,
                    organization_id=current_user.organization_id,
                    lead_id=payload.get("lead_id"),
                ),
            )
        except Exception:
            pass
        return note
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{note_id}", response_model=NoteSchema)
async def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific note"""
    note = crud_note.note.get(db=db, id=note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if not current_user.is_admin and note.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    return note

@router.put("/{note_id}", response_model=NoteSchema)
async def update_note(
    note_id: int,
    note_in: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a note"""
    note = crud_note.note.get(db=db, id=note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if not current_user.is_admin and note.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    note = crud_note.note.update(db=db, db_obj=note, obj_in=note_in)
    return note

@router.delete("/{note_id}", response_model=NoteSchema)
async def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a note"""
    note = crud_note.note.get(db=db, id=note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if not current_user.is_admin and note.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    note = crud_note.note.remove(db=db, id=note_id)
    return note
