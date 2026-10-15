"""
Territory Management API Endpoints

Enterprise-grade territory management for sales organizations.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.schemas.territory import (
    TerritoryCreate, TerritoryUpdate, TerritoryResponse, TerritoryHierarchy,
    TerritoryMemberCreate, TerritoryMemberResponse,
    TerritoryRuleCreate, TerritoryRuleUpdate, TerritoryRuleResponse,
    TerritoryAssignmentCreate, TerritoryAssignmentResponse, BulkAssignmentRequest, BulkAssignmentResponse,
    TerritoryQuotaCreate, TerritoryQuotaUpdate, TerritoryQuotaResponse,
    TerritoryAnalytics
)
from app.crud.crud_territory import (
    crud_territory, crud_territory_rule,
    crud_territory_assignment, crud_territory_quota
)

router = APIRouter(redirect_slashes=False)


# Territory Endpoints

@router.get("", response_model=List[TerritoryResponse])
@router.get("/", response_model=List[TerritoryResponse])
def list_territories(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    skip: int = 0,
    limit: int = 100,
    is_active: Optional[bool] = None
):
    """
    List all territories in the organization.
    """
    territories = crud_territory.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        is_active=is_active
    )

    # Add counts
    result = []
    for territory in territories:
        territory_dict = {
            **territory.__dict__,
            "full_path": territory.full_path,
            "children_count": len(territory.children),
            "members_count": len(territory.members)
        }
        result.append(TerritoryResponse(**territory_dict))

    return result


@router.get("/hierarchy", response_model=List[TerritoryHierarchy])
def get_territory_hierarchy(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Get territory hierarchy (tree structure).
    """
    territories = crud_territory.get_hierarchy(db, current_user.organization_id)

    def build_hierarchy(territory):
        territory_dict = {
            **territory.__dict__,
            "full_path": territory.full_path,
            "children_count": len(territory.children),
            "members_count": len(territory.members),
            "children": [build_hierarchy(child) for child in territory.children]
        }
        return territory_dict

    return [build_hierarchy(t) for t in territories]


@router.post("", response_model=TerritoryResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=TerritoryResponse, status_code=status.HTTP_201_CREATED)
def create_territory(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    territory_in: TerritoryCreate
):
    """
    Create a new territory.
    """
    # Verify parent exists if specified
    if territory_in.parent_id:
        parent = crud_territory.get(db, territory_in.parent_id)
        if not parent or parent.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent territory not found"
            )

    territory = crud_territory.create(
        db,
        obj_in=territory_in,
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )

    return TerritoryResponse(
        **territory.__dict__,
        full_path=territory.full_path,
        children_count=0,
        members_count=0
    )


@router.get("/{territory_id}", response_model=TerritoryResponse)
def get_territory(
    territory_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Get territory by ID.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    return TerritoryResponse(
        **territory.__dict__,
        full_path=territory.full_path,
        children_count=len(territory.children),
        members_count=len(territory.members)
    )


@router.put("/{territory_id}", response_model=TerritoryResponse)
def update_territory(
    territory_id: int,
    territory_in: TerritoryUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Update territory.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    territory = crud_territory.update(db, territory=territory, obj_in=territory_in)

    return TerritoryResponse(
        **territory.__dict__,
        full_path=territory.full_path,
        children_count=len(territory.children),
        members_count=len(territory.members)
    )


@router.delete("/{territory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_territory(
    territory_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Delete territory (soft delete).
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    crud_territory.delete(db, territory_id=territory_id)
    return None


# Territory Member Endpoints

@router.get("/{territory_id}/members", response_model=List[TerritoryMemberResponse])
def list_territory_members(
    territory_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    List all members of a territory.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    members = crud_territory.get_members(db, territory_id)

    # Enrich with user details
    result = []
    for member in members:
        member_dict = {
            **member.__dict__,
            "user_email": member.user.email if member.user else None,
            "user_name": f"{member.user.first_name} {member.user.last_name}" if member.user else None
        }
        result.append(TerritoryMemberResponse(**member_dict))

    return result


@router.post("/{territory_id}/members", response_model=TerritoryMemberResponse, status_code=status.HTTP_201_CREATED)
def add_territory_member(
    territory_id: int,
    member_in: TerritoryMemberCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Add a member to a territory.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    member = crud_territory.add_member(db, territory_id=territory_id, obj_in=member_in)

    return TerritoryMemberResponse(
        **member.__dict__,
        user_email=member.user.email if member.user else None,
        user_name=f"{member.user.first_name} {member.user.last_name}" if member.user else None
    )


@router.delete("/{territory_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_territory_member(
    territory_id: int,
    member_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Remove a member from a territory.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    crud_territory.remove_member(db, member_id=member_id)
    return None


# Territory Rule Endpoints

@router.get("/{territory_id}/rules", response_model=List[TerritoryRuleResponse])
def list_territory_rules(
    territory_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    is_active: Optional[bool] = None
):
    """
    List all assignment rules for a territory.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    rules = crud_territory_rule.get_by_territory(db, territory_id, is_active=is_active)
    return [TerritoryRuleResponse(**rule.__dict__) for rule in rules]


@router.post("/{territory_id}/rules", response_model=TerritoryRuleResponse, status_code=status.HTTP_201_CREATED)
def create_territory_rule(
    territory_id: int,
    rule_in: TerritoryRuleCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Create a new assignment rule for a territory.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    rule = crud_territory_rule.create(db, territory_id=territory_id, obj_in=rule_in)
    return TerritoryRuleResponse(**rule.__dict__)


@router.put("/{territory_id}/rules/{rule_id}", response_model=TerritoryRuleResponse)
def update_territory_rule(
    territory_id: int,
    rule_id: int,
    rule_in: TerritoryRuleUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Update a territory assignment rule.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    rule = crud_territory_rule.get(db, rule_id)
    if not rule or rule.territory_id != territory_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )

    rule = crud_territory_rule.update(db, rule=rule, obj_in=rule_in.dict(exclude_unset=True))
    return TerritoryRuleResponse(**rule.__dict__)


@router.delete("/{territory_id}/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_territory_rule(
    territory_id: int,
    rule_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Delete a territory assignment rule.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    rule = crud_territory_rule.get(db, rule_id)
    if not rule or rule.territory_id != territory_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )

    crud_territory_rule.delete(db, rule_id=rule_id)
    return None


# Territory Assignment Endpoints

@router.get("/{territory_id}/assignments", response_model=List[TerritoryAssignmentResponse])
def list_territory_assignments(
    territory_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    entity_type: Optional[str] = None
):
    """
    List all assignments for a territory.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    assignments = crud_territory_assignment.get_by_territory(
        db, territory_id, entity_type=entity_type
    )

    result = []
    for assignment in assignments:
        assignment_dict = {
            **assignment.__dict__,
            "territory_name": assignment.territory.name if assignment.territory else None
        }
        result.append(TerritoryAssignmentResponse(**assignment_dict))

    return result


@router.post("/assignments", response_model=TerritoryAssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(
    assignment_in: TerritoryAssignmentCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Manually assign an entity to a territory.
    """
    territory = crud_territory.get(db, assignment_in.territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    assignment = crud_territory_assignment.create(
        db,
        obj_in=assignment_in,
        assigned_by_user_id=current_user.id
    )

    return TerritoryAssignmentResponse(
        **assignment.__dict__,
        territory_name=assignment.territory.name if assignment.territory else None
    )


@router.post("/assignments/bulk", response_model=BulkAssignmentResponse)
def bulk_assign(
    bulk_in: BulkAssignmentRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Bulk assign multiple entities to a territory.
    """
    territory = crud_territory.get(db, bulk_in.territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    successful = crud_territory_assignment.bulk_assign(
        db,
        entity_type=bulk_in.entity_type,
        entity_ids=bulk_in.entity_ids,
        territory_id=bulk_in.territory_id,
        is_primary=bulk_in.is_primary,
        assigned_by_user_id=current_user.id
    )

    return BulkAssignmentResponse(
        successful=successful,
        failed=len(bulk_in.entity_ids) - successful,
        total=len(bulk_in.entity_ids)
    )


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Remove a territory assignment.
    """
    assignment = crud_territory_assignment.get(db, assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )

    # Verify user has access to this territory
    territory = crud_territory.get(db, assignment.territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    crud_territory_assignment.delete(db, assignment_id=assignment_id)
    return None


# Territory Quota Endpoints

@router.get("/{territory_id}/quotas", response_model=List[TerritoryQuotaResponse])
def list_territory_quotas(
    territory_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    year: Optional[int] = None,
    quarter: Optional[int] = None
):
    """
    List quotas for a territory.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    quotas = crud_territory_quota.get_by_territory(db, territory_id, year=year, quarter=quarter)

    result = []
    for quota in quotas:
        quota_dict = {
            **quota.__dict__,
            "revenue_attainment": quota.revenue_attainment,
            "deal_attainment": quota.deal_attainment
        }
        result.append(TerritoryQuotaResponse(**quota_dict))

    return result


@router.post("/{territory_id}/quotas", response_model=TerritoryQuotaResponse, status_code=status.HTTP_201_CREATED)
def create_territory_quota(
    territory_id: int,
    quota_in: TerritoryQuotaCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Create a new quota for a territory.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    quota = crud_territory_quota.create(db, territory_id=territory_id, obj_in=quota_in)

    return TerritoryQuotaResponse(
        **quota.__dict__,
        revenue_attainment=quota.revenue_attainment,
        deal_attainment=quota.deal_attainment
    )


@router.put("/{territory_id}/quotas/{quota_id}", response_model=TerritoryQuotaResponse)
def update_territory_quota(
    territory_id: int,
    quota_id: int,
    quota_in: TerritoryQuotaUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Update a territory quota.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    quota = crud_territory_quota.get(db, quota_id)
    if not quota or quota.territory_id != territory_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quota not found"
        )

    quota = crud_territory_quota.update(db, quota=quota, obj_in=quota_in.dict(exclude_unset=True))

    return TerritoryQuotaResponse(
        **quota.__dict__,
        revenue_attainment=quota.revenue_attainment,
        deal_attainment=quota.deal_attainment
    )


@router.delete("/{territory_id}/quotas/{quota_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_territory_quota(
    territory_id: int,
    quota_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    Delete a territory quota.
    """
    territory = crud_territory.get(db, territory_id)
    if not territory or territory.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Territory not found"
        )

    quota = crud_territory_quota.get(db, quota_id)
    if not quota or quota.territory_id != territory_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quota not found"
        )

    crud_territory_quota.delete(db, quota_id=quota_id)
    return None
