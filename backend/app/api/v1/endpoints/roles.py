from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api import deps
from app.core.security import check_permission
from app.schemas.role import (
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    RoleListResponse,
    Permission,
)

router = APIRouter(redirect_slashes=False)


@router.get("/permissions", response_model=List[Permission])
def list_permissions(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Tüm izinleri listele.
    Sadece admin kullanıcılar erişebilir.
    """
    if not check_permission(db, current_user.id, "manage_roles"):
        raise HTTPException(
            status_code=403,
            detail="Bu işlem için yetkiniz bulunmamaktadır"
        )
    
    permissions = db.query(models.Permission).all()
    return permissions


@router.get("", response_model=RoleListResponse)
def list_roles(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    name: Optional[str] = None,
    is_system: Optional[bool] = None,
) -> Any:
    """
    Rolleri listele.
    Filtreleme ve sayfalama destekler.
    """
    if not check_permission(db, current_user.id, "manage_roles"):
        raise HTTPException(
            status_code=403,
            detail="Bu işlem için yetkiniz bulunmamaktadır"
        )

    filters = {}
    if name:
        filters["name"] = name
    if is_system is not None:
        filters["is_system"] = is_system

    roles = crud.role.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        filters=filters
    )
    
    return {
        "success": True,
        "message": "Roller başarıyla listelendi",
        "data": roles
    }


@router.post("", response_model=RoleResponse)
def create_role(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    role_in: RoleCreate,
) -> Any:
    """
    Yeni rol oluştur.
    İzinlerle birlikte bir rol oluşturur.
    """
    if not check_permission(db, current_user.id, "manage_roles"):
        raise HTTPException(
            status_code=403,
            detail="Bu işlem için yetkiniz bulunmamaktadır"
        )

    # Rol adının benzersiz olduğunu kontrol et
    if crud.role.get_by_name(db, current_user.organization_id, role_in.name):
        raise HTTPException(
            status_code=400,
            detail=f"'{role_in.name}' adında bir rol zaten mevcut"
        )

    role = crud.role.create(db, obj_in=role_in)
    return {
        "success": True,
        "message": "Rol başarıyla oluşturuldu",
        "data": role
    }


@router.put("/{role_id}", response_model=RoleResponse)
def update_role(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    role_id: int,
    role_in: RoleUpdate,
) -> Any:
    """
    Rol güncelle.
    Rol bilgilerini ve izinlerini günceller.
    """
    if not check_permission(db, current_user.id, "manage_roles"):
        raise HTTPException(
            status_code=403,
            detail="Bu işlem için yetkiniz bulunmamaktadır"
        )

    role = crud.role.get(db, role_id)
    if not role:
        raise HTTPException(
            status_code=404,
            detail="Rol bulunamadı"
        )

    if role.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Bu role erişim yetkiniz yok"
        )

    # Sistem rollerini güncellemeye izin verme
    if role.is_system:
        raise HTTPException(
            status_code=400,
            detail="Sistem rolleri güncellenemez"
        )

    # Rol adı değişiyorsa benzersizliği kontrol et
    if role_in.name and role_in.name != role.name:
        if crud.role.get_by_name(db, current_user.organization_id, role_in.name):
            raise HTTPException(
                status_code=400,
                detail=f"'{role_in.name}' adında bir rol zaten mevcut"
            )

    role = crud.role.update(db, db_obj=role, obj_in=role_in)
    return {
        "success": True,
        "message": "Rol başarıyla güncellendi",
        "data": role
    }


@router.delete("/{role_id}", response_model=RoleResponse)
def delete_role(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    role_id: int,
) -> Any:
    """
    Rol sil.
    Sistem rolleri silinemez.
    """
    if not check_permission(db, current_user.id, "manage_roles"):
        raise HTTPException(
            status_code=403,
            detail="Bu işlem için yetkiniz bulunmamaktadır"
        )

    role = crud.role.get(db, role_id)
    if not role:
        raise HTTPException(
            status_code=404,
            detail="Rol bulunamadı"
        )

    if role.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Bu role erişim yetkiniz yok"
        )

    # Sistem rollerini silmeye izin verme
    if role.is_system:
        raise HTTPException(
            status_code=400,
            detail="Sistem rolleri silinemez"
        )

    # Role sahip kullanıcı varsa silmeye izin verme
    if role.users:
        raise HTTPException(
            status_code=400,
            detail="Bu role sahip kullanıcılar var. Önce kullanıcıların rollerini değiştirin"
        )

    role = crud.role.remove(db, id=role_id)
    return {
        "success": True,
        "message": "Rol başarıyla silindi",
        "data": role
    }
