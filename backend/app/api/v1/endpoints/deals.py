from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from decimal import Decimal

from app.api import deps
from app.crud import crud_deal
from app.models.user import User
from app.models.currency import Currency
from app.models.deal import Deal
from app.schemas.deal import Deal as DealSchema
from app.schemas.deal import DealCreate, DealUpdate, DealList, PipelineStats, DealResponse
from app.crud.crud_currency import ensure_default_currencies

import logging
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_currency_id(db, requested_id: int) -> int:
    """
    Ensure currency_id exists in `currencies` (Render/prod DBs may not have id=1).
    Prefer the requested id if that row exists, else USD, else first active, else create USD.
    """
    ensure_default_currencies(db)
    row = db.query(Currency).filter(Currency.id == requested_id).first()
    if row:
        return row.id

    usd = db.query(Currency).filter(Currency.code == "USD").first()
    if usd:
        logger.warning(
            "currency_id=%s invalid or inactive; using USD id=%s",
            requested_id,
            usd.id,
        )
        return usd.id

    first = (
        db.query(Currency)
        .filter(Currency.is_active == True)
        .order_by(Currency.id.asc())
        .first()
    )
    if first:
        logger.warning(
            "currency_id=%s invalid; using first active currency id=%s",
            requested_id,
            first.id,
        )
        return first.id

    c = Currency(code="USD", name="US Dollar", symbol="$", is_active=True)
    db.add(c)
    db.flush()
    logger.info("Created default USD currency row id=%s", c.id)
    return c.id

@router.get("", response_model=DealList)
@router.get("/", response_model=DealList)
def get_deals(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get all deals for the current user's organization.
    """
    # Filter by current user's organization
    deals = crud_deal.deal.get_multi(
        db, organization_id=current_user.organization_id, skip=skip
    )
    total = len(deals)
    logger.debug(f"Returning {total} deals")
    
    # Şema uyumsuzluğunu çözmek için deals öğelerini manuel olarak DealSchema'ya dönüştürüyoruz
    schema_deals = []
    for deal in deals:
        schema_deals.append(DealSchema.model_validate(deal))
    
    return DealList(items=schema_deals, total=total)

@router.post("", response_model=DealResponse)
@router.post("/", response_model=DealResponse)
def create_deal(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    deal_in: DealCreate
) -> Any:
    """
    Create new deal.
    """
    deal_in.organization_id = current_user.organization_id

    resolved_currency = _resolve_currency_id(db, deal_in.currency_id)
    if resolved_currency != deal_in.currency_id:
        deal_in = deal_in.model_copy(update={"currency_id": resolved_currency})

    # Create the deal
    deal = crud_deal.deal.create(db=db, obj_in=deal_in)
    
    # Log activity for deal creation
    try:
        # Create activity for deal creation
        from app.models.activity import Activity, ActivityType
        
        activity = Activity(
            type=ActivityType.NOTE,
            description=f"Deal created: {deal.name}",
            user_id=current_user.id,
            organization_id=deal.organization_id,
            deal_id=deal.id,
            lead_id=deal.lead_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(activity)
        db.commit()
    except Exception as e:
        # Log error but don't fail the request
        print(f"Error creating activity for deal creation: {str(e)}")
    
    # Şema uyumsuzluğunu çözmek için manuel olarak DealSchema'ya dönüştürüyoruz
    deal_schema = DealSchema.model_validate(deal)
    
    return DealResponse(
        success=True,
        message="Deal created successfully",
        data=deal_schema
    )

@router.get("/{deal_id}", response_model=DealSchema)
def get_deal(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    deal_id: int,
) -> Any:
    """
    Get a specific deal by ID.
    """
    deal = crud_deal.deal.get(db, deal_id=deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if deal.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Şema uyumsuzluğunu çözmek için manuel olarak DealSchema'ya dönüştürüyoruz
    return DealSchema.model_validate(deal)

@router.put("/{deal_id}", response_model=DealResponse)
def update_deal(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    deal_id: int,
    deal_in: DealUpdate
) -> Any:
    """
    Update deal.
    """
    deal = crud_deal.deal.get(db=db, deal_id=deal_id)
    
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )
    
    # Check if user has permission to update this deal
    if deal.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    
    # Update the deal
    deal = crud_deal.deal.update(db=db, db_obj=deal, obj_in=deal_in)
    
    # Log activity for deal update
    try:
        # Create activity for deal update
        from app.models.activity import Activity, ActivityType
        
        # Determine what was updated
        description = "Deal updated"
        if "status" in deal_in.dict(exclude_unset=True):
            description = f"Deal status changed to {deal.status}"
            if deal.status == "Closed_Won":
                description = "Deal won"
            elif deal.status == "Closed_Lost":
                description = "Deal lost"
            activity_type = ActivityType.STAGE_CHANGE
        else:
            activity_type = ActivityType.NOTE
        
        activity = Activity(
            type=activity_type,
            description=description,
            user_id=current_user.id,
            organization_id=deal.organization_id,
            deal_id=deal.id,
            lead_id=deal.lead_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(activity)
        db.commit()
    except Exception as e:
        # Log error but don't fail the request
        print(f"Error creating activity for deal update: {str(e)}")
    
    # Şema uyumsuzluğunu çözmek için manuel olarak DealSchema'ya dönüştürüyoruz
    deal_schema = DealSchema.model_validate(deal)
    
    return DealResponse(
        success=True,
        message="Deal updated successfully",
        data=deal_schema
    )

@router.delete("/{deal_id}", response_model=DealSchema)
def delete_deal(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    deal_id: int,
) -> Any:
    """
    Delete a deal.
    """
    deal = crud_deal.deal.get(db, deal_id=deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if deal.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    deal = crud_deal.deal.delete(db, deal_id=deal_id)
    
    # Şema uyumsuzluğunu çözmek için manuel olarak DealSchema'ya dönüştürüyoruz
    if deal:
        return DealSchema.model_validate(deal)
    raise HTTPException(status_code=404, detail="Deal not found")

@router.get("/pipeline/stats", response_model=PipelineStats)
@router.get("/pipeline/summary", response_model=PipelineStats)
def get_pipeline_summary(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get a summary of the pipeline values and deal counts by status.
    """
    if current_user.is_admin:
        user_id = None
    else:
        user_id = current_user.id
    
    # Get pipeline data from DB
    pipeline_data = db.query(
        Deal.status,
        func.sum(Deal.amount).label("value"),
        func.count(Deal.id).label("count")
    ).filter(
        Deal.organization_id == current_user.organization_id
    ).group_by(
        Deal.status
    ).all()
    
    # Initialize counts
    by_status = {}
    total_value = 0.0
    total_deals = 0
    
    # Process pipeline data
    for status, value, count in pipeline_data:
        value_float = float(value or 0)
        total_value += value_float
        total_deals += count
        by_status[status] = {
            "value": value_float,
            "count": float(count)  # float olarak atıyoruz
        }
    
    # Group by probability ranges
    by_probability = {
        "high": {"value": 0.0, "count": 0.0},
        "medium": {"value": 0.0, "count": 0.0},
        "low": {"value": 0.0, "count": 0.0}
    }
    
    # Get deals for probability calculation
    deals = db.query(Deal).filter(
        Deal.organization_id == current_user.organization_id
    ).all()
    
    # Map deals to probability ranges
    for deal in deals:
        if not deal.amount:
            continue
            
        if deal.status in ["Qualified", "Proposal"]:
            range_key = "high"
        elif deal.status in ["Negotiation", "Closing"]:
            range_key = "medium"
        else:
            range_key = "low"
            
        by_probability[range_key]["count"] += 1.0  # float olarak atıyoruz
        by_probability[range_key]["value"] += float(deal.amount or 0)
    
    # Create and return pipeline stats
    return PipelineStats(
        total_value=float(total_value),
        by_status=by_status,
        total_deals=total_deals,
        by_probability=by_probability
    )
