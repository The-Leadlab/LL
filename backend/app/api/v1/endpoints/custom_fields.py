from typing import Any, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api import deps
from app.core.security import check_permission
from app.schemas.custom_field import (
    CustomFieldDefinitionResponse,
    CustomFieldDefinitionListResponse,
    CustomFieldValueResponse,
    CustomFieldValueListResponse,
    BulkCustomFieldValuesResponse,
    CustomFieldEntityType,
    CustomFieldType
)

router = APIRouter(redirect_slashes=False)


@router.get("/definitions", response_model=CustomFieldDefinitionListResponse)
def list_field_definitions(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    entity_type: Optional[CustomFieldEntityType] = None,
    field_type: Optional[CustomFieldType] = None,
    is_visible: Optional[bool] = None,
    group_name: Optional[str] = None,
) -> Any:
    """
    List custom field definitions with filtering and pagination.
    """
    if not check_permission(db, current_user.id, "manage_custom_fields"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage custom fields"
        )

    filters = {}
    if entity_type:
        filters["entity_type"] = entity_type
    if field_type:
        filters["field_type"] = field_type
    if is_visible is not None:
        filters["is_visible"] = is_visible
    if group_name:
        filters["group_name"] = group_name

    fields = crud.custom_field_definition.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        filters=filters
    )

    return {
        "success": True,
        "message": "Custom field definitions retrieved successfully",
        "data": fields
    }


@router.post("/definitions", response_model=CustomFieldDefinitionResponse)
def create_field_definition(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    field_in: schemas.CustomFieldDefinitionCreate,
) -> Any:
    """
    Create new custom field definition.
    """
    if not check_permission(db, current_user.id, "manage_custom_fields"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage custom fields"
        )

    # Check if field key already exists
    existing_field = crud.custom_field_definition.get_by_key(
        db,
        organization_id=current_user.organization_id,
        entity_type=field_in.entity_type,
        key=field_in.key
    )
    if existing_field:
        raise HTTPException(
            status_code=400,
            detail=f"Field with key '{field_in.key}' already exists"
        )

    field = crud.custom_field_definition.create(db, obj_in=field_in)
    return {
        "success": True,
        "message": "Custom field definition created successfully",
        "data": field
    }


@router.get("/definitions/{id}", response_model=CustomFieldDefinitionResponse)
def get_field_definition(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get custom field definition by ID.
    """
    if not check_permission(db, current_user.id, "manage_custom_fields"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage custom fields"
        )

    field = crud.custom_field_definition.get(db, id)
    if not field:
        raise HTTPException(
            status_code=404,
            detail="Custom field definition not found"
        )

    if field.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this field"
        )

    return {
        "success": True,
        "message": "Custom field definition retrieved successfully",
        "data": field
    }


@router.put("/definitions/{id}", response_model=CustomFieldDefinitionResponse)
def update_field_definition(
    id: int,
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    field_in: schemas.CustomFieldDefinitionUpdate,
) -> Any:
    """
    Update custom field definition.
    """
    if not check_permission(db, current_user.id, "manage_custom_fields"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage custom fields"
        )

    field = crud.custom_field_definition.get(db, id)
    if not field:
        raise HTTPException(
            status_code=404,
            detail="Custom field definition not found"
        )

    if field.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to modify this field"
        )

    field = crud.custom_field_definition.update(
        db, db_obj=field, obj_in=field_in
    )
    return {
        "success": True,
        "message": "Custom field definition updated successfully",
        "data": field
    }


@router.delete("/definitions/{id}", response_model=CustomFieldDefinitionResponse)
def delete_field_definition(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Delete custom field definition.
    """
    if not check_permission(db, current_user.id, "manage_custom_fields"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage custom fields"
        )

    field = crud.custom_field_definition.get(db, id)
    if not field:
        raise HTTPException(
            status_code=404,
            detail="Custom field definition not found"
        )

    if field.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to delete this field"
        )

    field = crud.custom_field_definition.remove(db, id=id)
    return {
        "success": True,
        "message": "Custom field definition deleted successfully",
        "data": field
    }


@router.post("/definitions/reorder", response_model=CustomFieldDefinitionListResponse)
def reorder_fields(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    entity_type: CustomFieldEntityType,
    field_orders: Dict[int, int],
) -> Any:
    """
    Reorder custom fields.
    """
    if not check_permission(db, current_user.id, "manage_custom_fields"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to manage custom fields"
        )

    fields = crud.custom_field_definition.reorder(
        db,
        organization_id=current_user.organization_id,
        entity_type=entity_type,
        field_orders=field_orders
    )

    return {
        "success": True,
        "message": "Custom fields reordered successfully",
        "data": {
            "fields": fields,
            "total": len(fields),
            "page": 1,
            "size": len(fields),
            "has_more": False
        }
    }


@router.get("/values/{entity_type}/{entity_id}", response_model=CustomFieldValueListResponse)
def get_entity_field_values(
    entity_type: CustomFieldEntityType,
    entity_id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get all custom field values for an entity.
    """
    values = crud.custom_field_value.get_for_entity(
        db,
        organization_id=current_user.organization_id,
        entity_type=entity_type,
        entity_id=entity_id
    )

    return {
        "success": True,
        "message": "Custom field values retrieved successfully",
        "data": {
            "values": values,
            "total": len(values),
            "page": 1,
            "size": len(values),
            "has_more": False
        }
    }


@router.post("/values/bulk", response_model=BulkCustomFieldValuesResponse)
def bulk_update_field_values(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    bulk_values: schemas.BulkCustomFieldValues,
) -> Any:
    """
    Bulk update custom field values for an entity.
    """
    result = crud.custom_field_value.bulk_update(
        db,
        organization_id=current_user.organization_id,
        entity_type=bulk_values.entity_type,
        entity_id=bulk_values.entity_id,
        values=bulk_values.values
    )

    return {
        "success": True,
        "message": "Custom field values updated successfully",
        "data": result
    }
