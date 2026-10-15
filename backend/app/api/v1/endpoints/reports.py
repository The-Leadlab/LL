from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.crud.crud_report import report
from app.models.user import User
from app.schemas.report import (
    ReportType,
    ReportFormat,
    ReportRequest,
    ReportResponse,
    DashboardStats
)

router = APIRouter(redirect_slashes=False)

@router.get("", response_model=DashboardStats)
@router.get("/", response_model=DashboardStats)
@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> DashboardStats:
    """
    Get dashboard statistics.
    """
    if not start_date:
        start_date = datetime.now() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now()

    if current_user.is_admin:
        organization_id = None
    else:
        organization_id = current_user.organization_id

    stats = report.get_dashboard_stats(
        db,
        organization_id=organization_id,
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date
    )
    return stats

@router.post("/generate", response_model=ReportResponse)
def generate_report(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    report_request: ReportRequest,
) -> ReportResponse:
    """
    Generate a custom report.
    """
    if not current_user.is_admin and report_request.report_type in [
        ReportType.SYSTEM_AUDIT,
        ReportType.USER_ACTIVITY
    ]:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to generate this report type"
        )

    if current_user.is_admin:
        organization_id = report_request.organization_id
    else:
        organization_id = current_user.organization_id

    result = report.generate_report(
        db,
        organization_id=organization_id,
        user_id=current_user.id,
        report_type=report_request.report_type,
        report_format=report_request.report_format,
        start_date=report_request.start_date,
        end_date=report_request.end_date,
        filters=report_request.filters
    )
    return result

@router.get("/scheduled", response_model=List[ReportResponse])
def get_scheduled_reports(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
) -> List[ReportResponse]:
    """
    Get list of scheduled reports.
    """
    if current_user.is_admin:
        organization_id = None
    else:
        organization_id = current_user.organization_id

    reports = report.get_scheduled_reports(
        db,
        organization_id=organization_id,
        user_id=current_user.id,
        skip=skip,
        limit=limit
    )
    return reports

@router.post("/schedule", response_model=ReportResponse)
def schedule_report(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    report_request: ReportRequest,
) -> ReportResponse:
    """
    Schedule a recurring report.
    """
    if not current_user.is_admin and report_request.report_type in [
        ReportType.SYSTEM_AUDIT,
        ReportType.USER_ACTIVITY
    ]:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to schedule this report type"
        )

    if current_user.is_admin:
        organization_id = report_request.organization_id
    else:
        organization_id = current_user.organization_id

    scheduled_report = report.schedule_report(
        db,
        organization_id=organization_id,
        user_id=current_user.id,
        report_type=report_request.report_type,
        report_format=report_request.report_format,
        schedule=report_request.schedule,
        filters=report_request.filters
    )
    return scheduled_report

@router.delete("/schedule/{report_id}", response_model=ReportResponse)
def delete_scheduled_report(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    report_id: int,
) -> ReportResponse:
    """
    Delete a scheduled report.
    """
    report_obj = report.get(db, id=report_id)
    if not report_obj:
        raise HTTPException(
            status_code=404,
            detail="Report not found"
        )

    if not current_user.is_admin and report_obj.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions"
        )

    deleted_report = report.remove_scheduled_report(db, id=report_id)
    return deleted_report
