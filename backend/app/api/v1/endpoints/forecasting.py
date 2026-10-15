"""
Forecasting API Endpoints

Collaborative forecasting system with:
- Forecast periods (weekly, monthly, quarterly, annual)
- Individual and team forecasts
- Manager adjustments and approvals
- Territory-based rollups
- AI-powered predictions
- Quota tracking
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date

from app.api import deps
from app.models.user import User
from app.models.forecast import (
    ForecastPeriod, Forecast, ForecastItem, ForecastHistory,
    ForecastRollup, ForecastComment, ForecastCategory, ForecastStatus,
    ForecastPeriodType,
)
from app.db.session import get_db

router = APIRouter(redirect_slashes=False)


class ForecastPeriodCreate(BaseModel):
    period_type: str
    start_date: str
    end_date: str


class ForecastUpsert(BaseModel):
    period_id: int
    pipeline_amount: float = 0.0
    best_case_amount: float = 0.0
    commit_amount: float = 0.0
    closed_amount: float = 0.0
    territory_id: Optional[int] = None
    quota_amount: Optional[float] = None


class ForecastAdjustBody(BaseModel):
    manager_adjusted_commit: float
    adjustment_reason: str


def _derive_period_calendar_fields(
    period_type: ForecastPeriodType, start: date
) -> tuple[int, Optional[int], Optional[int], Optional[int]]:
    y = start.year
    if period_type == ForecastPeriodType.MONTHLY:
        return y, None, start.month, None
    if period_type == ForecastPeriodType.QUARTERLY:
        q = (start.month - 1) // 3 + 1
        return y, q, None, None
    if period_type == ForecastPeriodType.WEEKLY:
        _, w, _ = start.isocalendar()
        return y, None, None, int(w)
    if period_type == ForecastPeriodType.ANNUAL:
        return y, None, None, None
    return y, None, None, None


# ==================== FORECAST PERIODS ====================

@router.get("/periods", response_model=List[dict])
def get_forecast_periods(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get all forecast periods for the organization"""
    periods = db.query(ForecastPeriod).filter(
        ForecastPeriod.organization_id == current_user.organization_id
    ).order_by(ForecastPeriod.start_date.desc()).offset(skip).limit(limit).all()

    return [
        {
            "id": p.id,
            "organization_id": p.organization_id,
            "period_type": p.period_type.value,
            "start_date": p.start_date.isoformat(),
            "end_date": p.end_date.isoformat(),
            "is_closed": p.is_closed,
            "created_at": p.created_at.isoformat() if p.created_at else None
        }
        for p in periods
    ]


@router.get("/periods/active", response_model=dict)
def get_active_period(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get the currently active forecast period"""
    today = datetime.now().date()

    period = db.query(ForecastPeriod).filter(
        ForecastPeriod.organization_id == current_user.organization_id,
        ForecastPeriod.is_closed == False,
        ForecastPeriod.start_date <= today,
        ForecastPeriod.end_date >= today
    ).first()

    if not period:
        raise HTTPException(status_code=404, detail="No active forecast period found")

    return {
        "id": period.id,
        "organization_id": period.organization_id,
        "period_type": period.period_type.value,
        "start_date": period.start_date.isoformat(),
        "end_date": period.end_date.isoformat(),
        "is_closed": period.is_closed,
        "created_at": period.created_at.isoformat() if period.created_at else None
    }


@router.post("/periods", response_model=dict)
def create_forecast_period(
    body: ForecastPeriodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Create a new forecast period"""
    from datetime import time as time_

    try:
        pt = ForecastPeriodType(body.period_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid period_type: {body.period_type}")

    sd = date.fromisoformat(body.start_date)
    ed = date.fromisoformat(body.end_date)
    if ed < sd:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")

    year, quarter, month, week = _derive_period_calendar_fields(pt, sd)
    start_dt = datetime.combine(sd, time_.min)
    end_dt = datetime.combine(ed, time_(23, 59, 59))

    period = ForecastPeriod(
        organization_id=current_user.organization_id,
        period_type=pt,
        year=year,
        quarter=quarter,
        month=month,
        week=week,
        start_date=start_dt,
        end_date=end_dt,
        is_closed=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    db.add(period)
    db.commit()
    db.refresh(period)

    return {
        "id": period.id,
        "organization_id": period.organization_id,
        "period_type": period.period_type.value,
        "start_date": period.start_date.isoformat(),
        "end_date": period.end_date.isoformat(),
        "is_closed": period.is_closed,
        "created_at": period.created_at.isoformat() if period.created_at else None
    }


@router.post("/periods/{period_id}/close", response_model=dict)
def close_forecast_period(
    period_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Close a forecast period"""
    period = db.query(ForecastPeriod).filter(
        ForecastPeriod.id == period_id,
        ForecastPeriod.organization_id == current_user.organization_id
    ).first()

    if not period:
        raise HTTPException(status_code=404, detail="Forecast period not found")

    period.is_closed = True
    db.commit()
    db.refresh(period)

    return {
        "id": period.id,
        "organization_id": period.organization_id,
        "period_type": period.period_type.value,
        "start_date": period.start_date.isoformat(),
        "end_date": period.end_date.isoformat(),
        "is_closed": period.is_closed,
        "created_at": period.created_at.isoformat() if period.created_at else None
    }


# ==================== FORECASTS ====================

@router.get("/my", response_model=dict)
def get_my_forecast(
    period_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get current user's forecast for a period"""
    forecast = db.query(Forecast).filter(
        Forecast.period_id == period_id,
        Forecast.user_id == current_user.id
    ).first()

    if not forecast:
        # Return empty forecast structure
        return {
            "id": 0,
            "period_id": period_id,
            "user_id": current_user.id,
            "pipeline_amount": 0,
            "best_case_amount": 0,
            "commit_amount": 0,
            "closed_amount": 0,
            "status": "draft",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }

    return _forecast_to_dict(forecast)


@router.get("", response_model=List[dict])
def get_forecasts(
    period_id: int = Query(...),
    territory_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get forecasts for a period (optionally filtered by territory)"""
    query = db.query(Forecast).filter(Forecast.period_id == period_id)

    if territory_id:
        query = query.filter(Forecast.territory_id == territory_id)

    forecasts = query.all()
    return [_forecast_to_dict(f) for f in forecasts]


@router.get("/rollup", response_model=dict)
def get_forecast_rollup(
    period_id: int = Query(...),
    rollup_level: str = Query(...),
    entity_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get forecast rollup (team, territory, organization)"""
    # Calculate rollup from forecasts
    query = db.query(Forecast).filter(Forecast.period_id == period_id)

    if rollup_level == "territory" and entity_id:
        query = query.filter(Forecast.territory_id == entity_id)

    forecasts = query.all()

    # Aggregate
    total_pipeline = sum(f.pipeline_amount for f in forecasts)
    total_best_case = sum(f.best_case_amount for f in forecasts)
    total_commit = sum(f.commit_amount for f in forecasts)
    total_closed = sum(f.closed_amount for f in forecasts)
    total_quota = sum(f.quota_amount or 0 for f in forecasts)

    return {
        "period_id": period_id,
        "rollup_level": rollup_level,
        "entity_id": entity_id,
        "total_pipeline": total_pipeline,
        "total_best_case": total_best_case,
        "total_commit": total_commit,
        "total_closed": total_closed,
        "total_quota": total_quota,
        "quota_attainment": (total_closed / total_quota * 100) if total_quota > 0 else 0,
        "forecast_count": len(forecasts)
    }


@router.get("/{forecast_id}", response_model=dict)
def get_forecast(
    forecast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Get a specific forecast"""
    forecast = db.query(Forecast).filter(Forecast.id == forecast_id).first()

    if not forecast:
        raise HTTPException(status_code=404, detail="Forecast not found")

    return _forecast_to_dict(forecast)


@router.post("", response_model=dict)
def create_or_update_forecast(
    body: ForecastUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Create or update a forecast"""
    period = db.query(ForecastPeriod).filter(
        ForecastPeriod.id == body.period_id,
        ForecastPeriod.organization_id == current_user.organization_id,
    ).first()
    if not period:
        raise HTTPException(status_code=404, detail="Forecast period not found")

    forecast = db.query(Forecast).filter(
        Forecast.period_id == body.period_id,
        Forecast.user_id == current_user.id
    ).first()

    if forecast:
        # Update existing
        forecast.pipeline_amount = body.pipeline_amount
        forecast.best_case_amount = body.best_case_amount
        forecast.commit_amount = body.commit_amount
        forecast.closed_amount = body.closed_amount
        if body.territory_id is not None:
            forecast.territory_id = body.territory_id
        if body.quota_amount is not None:
            forecast.quota_amount = body.quota_amount
        forecast.updated_at = datetime.utcnow()
    else:
        # Create new
        forecast = Forecast(
            period_id=body.period_id,
            user_id=current_user.id,
            organization_id=current_user.organization_id,
            territory_id=body.territory_id,
            pipeline_amount=body.pipeline_amount,
            best_case_amount=body.best_case_amount,
            commit_amount=body.commit_amount,
            closed_amount=body.closed_amount,
            quota_amount=body.quota_amount,
            status=ForecastStatus.DRAFT,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(forecast)

    db.commit()
    db.refresh(forecast)

    return _forecast_to_dict(forecast)


@router.post("/{forecast_id}/submit", response_model=dict)
def submit_forecast(
    forecast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Submit a forecast for approval"""
    forecast = db.query(Forecast).filter(
        Forecast.id == forecast_id,
        Forecast.user_id == current_user.id
    ).first()

    if not forecast:
        raise HTTPException(status_code=404, detail="Forecast not found")

    forecast.status = ForecastStatus.SUBMITTED
    forecast.submitted_at = datetime.now()
    forecast.updated_at = datetime.now()

    db.commit()
    db.refresh(forecast)

    return _forecast_to_dict(forecast)


@router.post("/{forecast_id}/adjust", response_model=dict)
def adjust_forecast(
    forecast_id: int,
    body: ForecastAdjustBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Manager adjusts a forecast"""
    forecast = db.query(Forecast).filter(Forecast.id == forecast_id).first()

    if not forecast:
        raise HTTPException(status_code=404, detail="Forecast not found")

    forecast.manager_adjusted_commit = body.manager_adjusted_commit
    forecast.adjustment_reason = body.adjustment_reason
    forecast.adjusted_by_id = current_user.id
    forecast.adjusted_at = datetime.now()
    forecast.updated_at = datetime.now()

    db.commit()
    db.refresh(forecast)

    return _forecast_to_dict(forecast)


@router.delete("/{forecast_id}", response_model=dict)
def delete_forecast(
    forecast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """Delete a draft forecast owned by the current user."""
    forecast = db.query(Forecast).filter(
        Forecast.id == forecast_id,
        Forecast.user_id == current_user.id
    ).first()

    if not forecast:
        raise HTTPException(status_code=404, detail="Forecast not found")

    if forecast.status != ForecastStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only draft forecasts can be deleted")

    db.delete(forecast)
    db.commit()
    return {"message": "Forecast deleted"}


# Helper function
def _forecast_to_dict(forecast: Forecast) -> dict:
    """Convert forecast to dict"""
    quota_attainment = None
    if forecast.quota_amount and forecast.quota_amount > 0:
        quota_attainment = (forecast.closed_amount / forecast.quota_amount) * 100

    final_commit = forecast.manager_adjusted_commit or forecast.commit_amount

    return {
        "id": forecast.id,
        "period_id": forecast.period_id,
        "user_id": forecast.user_id,
        "territory_id": forecast.territory_id,
        "pipeline_amount": float(forecast.pipeline_amount),
        "best_case_amount": float(forecast.best_case_amount),
        "commit_amount": float(forecast.commit_amount),
        "closed_amount": float(forecast.closed_amount),
        "manager_adjusted_commit": float(forecast.manager_adjusted_commit) if forecast.manager_adjusted_commit else None,
        "adjustment_reason": forecast.adjustment_reason,
        "ai_predicted_commit": float(forecast.ai_predicted_commit) if forecast.ai_predicted_commit else None,
        "quota_amount": float(forecast.quota_amount) if forecast.quota_amount else None,
        "status": forecast.status.value,
        "submitted_at": forecast.submitted_at.isoformat() if forecast.submitted_at else None,
        "adjusted_by_id": forecast.adjusted_by_id,
        "adjusted_at": forecast.adjusted_at.isoformat() if forecast.adjusted_at else None,
        "created_at": forecast.created_at.isoformat() if forecast.created_at else None,
        "updated_at": forecast.updated_at.isoformat() if forecast.updated_at else None,
        "quota_attainment": quota_attainment,
        "final_commit_amount": final_commit
    }
