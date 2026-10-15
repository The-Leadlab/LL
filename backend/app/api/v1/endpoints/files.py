import os
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import get_db, get_current_user
from app.core.config import settings
from app.core.security import check_permission
from app.utils.file_upload import upload_file, delete_file
from app.schemas.file import (
    FileResponse,
    FileListResponse,
    FileUploadResponse,
    FileDeleteResponse,
    FileEntityType
)

router = APIRouter(redirect_slashes=False)


@router.get("", response_model=FileListResponse)
def list_files(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    entity_type: Optional[FileEntityType] = None,
    entity_id: Optional[int] = None,
    mime_type: Optional[str] = None,
    name: Optional[str] = None,
) -> Any:
    """
    List files with filtering and pagination.
    """
    filters = {}
    if entity_type:
        filters["entity_type"] = entity_type
    if entity_id:
        filters["entity_id"] = entity_id
    if mime_type:
        filters["mime_type"] = mime_type
    if name:
        filters["name"] = name

    files = crud.file.get_by_organization(
        db=db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit
    )
    
    # Get total count for pagination
    total = len(files)  # For simplicity, you might want to add a count method to CRUD
    
    return {
        "success": True,
        "message": "Files retrieved successfully",
        "data": {
            "files": files,
            "total": total,
            "page": skip // limit + 1,
            "size": limit,
            "has_more": total > skip + limit
        }
    }


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file_endpoint(
    entity_type: FileEntityType,
    entity_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """
    Upload a new file.
    """
    # Validate entity exists
    entity = None
    if entity_type == FileEntityType.lead:
        entity = crud.lead.get(db, entity_id)
    elif entity_type == FileEntityType.deal:
        entity = crud.deal.get(db, entity_id)
    elif entity_type == FileEntityType.task:
        entity = crud.task.get(db, entity_id)
    elif entity_type == FileEntityType.note:
        entity = crud.note.get(db, entity_id)
    
    if not entity:
        raise HTTPException(
            status_code=404,
            detail=f"{entity_type} not found"
        )

    # Upload file
    try:
        file_path = f"organizations/{current_user.organization_id}/{entity_type}s/{entity_id}"
        stored_file = await upload_file(
            file,
            file_path,
            max_size=settings.MAX_FILE_SIZE
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    # Create file record
    file_in = schemas.FileCreate(
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        name=stored_file.name,
        original_name=file.filename,
        mime_type=file.content_type,
        size=stored_file.size,
        path=stored_file.path,
        entity_type=entity_type,
        entity_id=entity_id
    )

    db_file = crud.file.create(db, obj_in=file_in)

    return {
        "success": True,
        "message": "File uploaded successfully",
        "data": db_file
    }


@router.get("/{id}", response_model=FileResponse)
def get_file(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """
    Get file details by ID.
    """
    file = crud.file.get(db, id)
    if not file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    if file.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this file"
        )

    return {
        "success": True,
        "message": "File details retrieved successfully",
        "data": file
    }


@router.get("/{id}/download")
def download_file(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """
    Download file by ID.
    """
    file = crud.file.get(db, id)
    if not file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    if file.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this file"
        )

    file_path = os.path.join(settings.UPLOAD_DIR, file.path)
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail="File not found on storage"
        )

    return FileResponse(
        file_path,
        filename=file.original_name,
        media_type=file.mime_type
    )


@router.get("/{id}/preview")
def preview_file(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """
    Preview file by ID (images and PDFs).
    """
    file = crud.file.get(db, id)
    if not file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    if file.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this file"
        )

    if not file.preview_url:
        raise HTTPException(
            status_code=400,
            detail="File preview not supported"
        )

    file_path = os.path.join(settings.UPLOAD_DIR, file.path)
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail="File not found on storage"
        )

    return FileResponse(
        file_path,
        media_type=file.mime_type
    )


@router.delete("/{id}", response_model=FileDeleteResponse)
def delete_file_endpoint(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """
    Delete file by ID.
    """
    file = crud.file.get(db, id)
    if not file:
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    if file.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to delete this file"
        )

    # Delete physical file
    file_path = os.path.join(settings.UPLOAD_DIR, file.path)
    if os.path.exists(file_path):
        try:
            delete_file(file_path)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error deleting file: {str(e)}"
            )

    # Delete database record
    crud.file.remove(db, id=id)

    return {
        "success": True,
        "message": "File deleted successfully"
    }
