from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, extract, desc, asc, text, and_, or_, literal
from app.api import deps
from app.crud.crud_user import user as crud_user
from app.models.user import User
from app.models.lead import Lead
from app.models.deal import Deal, DealStatus
from app.models.activity import Activity
from app.models.task import Task, TaskStatus
from app.models.note import Note
from app.models.lead_stage import LeadStage
from app.models.tag import Tag
from app.models.communication import Communication
from app.models.event import Event
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(redirect_slashes=False)


def _org_active_users(db: Session, organization_id: int) -> List[User]:
    """Active, non-tombstoned users only — deleted users must not appear in Performance."""
    return crud_user.get_organization_users(db, organization_id)


def _lead_alive():
    """Exclude soft-deleted leads from report aggregations."""
    return Lead.is_deleted.is_(False)


def _purge_leads_owned_by_deleted_users(db: Session, organization_id: int) -> int:
    """
    Soft-delete leads still attached to deactivated/tombstoned users so they
    stop inflating Performance and other reports.
    """
    inactive_ids = [
        row[0]
        for row in db.query(User.id)
        .filter(
            User.organization_id == organization_id,
            or_(
                User.is_active.is_(False),
                func.lower(User.email).like("%@deleted.local"),
                func.lower(User.email).like("deleted+user-%"),
            ),
        )
        .all()
    ]
    if not inactive_ids:
        return 0
    updated = (
        db.query(Lead)
        .filter(
            Lead.organization_id == organization_id,
            Lead.is_deleted.is_(False),
            or_(Lead.user_id.in_(inactive_ids), Lead.created_by.in_(inactive_ids)),
        )
        .update({"is_deleted": True, "updated_at": datetime.utcnow()}, synchronize_session=False)
    )
    if updated:
        db.commit()
    return int(updated or 0)

# Response Models
class LeadSourceReport(BaseModel):
    source: str
    total_leads: int
    qualified_leads: int
    conversion_rate: float
    total_value: float

class SalesFunnelReport(BaseModel):
    stage_name: str
    lead_count: int
    conversion_rate: float
    average_time_in_stage: float
    drop_off_rate: float

class PerformanceReport(BaseModel):
    user_name: str
    user_email: str
    total_leads: int
    qualified_leads: int
    deals_closed: int
    total_revenue: float
    activities_completed: int
    tasks_completed: int

class TimeSeriesData(BaseModel):
    date: str
    leads_created: int
    deals_closed: int
    revenue: float
    activities: int

class GeographicReport(BaseModel):
    country: str
    city: Optional[str]
    lead_count: int
    deal_count: int
    total_value: float
    conversion_rate: float

class DetailedAnalytics(BaseModel):
    lead_sources: List[LeadSourceReport]
    sales_funnel: List[SalesFunnelReport]
    user_performance: List[PerformanceReport]
    time_series: List[TimeSeriesData]
    geographic_data: List[GeographicReport]
    summary_metrics: Dict[str, Any]

# Enhanced Response Models
class KPIMetric(BaseModel):
    name: str
    current_value: float
    previous_value: float
    change_percentage: float
    target_value: Optional[float] = None
    unit: str = ""
    trend: str = "neutral"  # "up", "down", "neutral"

class ConversionFunnelStage(BaseModel):
    stage_name: str
    stage_order: int
    lead_count: int
    conversion_rate: float
    drop_off_count: int
    drop_off_rate: float
    average_time_days: float

class UserPerformanceDetail(BaseModel):
    user_id: int
    user_name: str
    user_email: str
    total_leads: int
    qualified_leads: int
    deals_created: int
    deals_won: int
    deals_lost: int
    total_revenue: float
    conversion_rate: float
    average_deal_size: float
    activities_count: int
    tasks_completed: int
    response_time_hours: float

class LeadSourceMetrics(BaseModel):
    source: str
    total_leads: int
    qualified_leads: int
    deals_created: int
    deals_won: int
    total_revenue: float
    cost_per_lead: float
    roi_percentage: float
    conversion_rate: float
    quality_score: float

class PipelineHealthMetrics(BaseModel):
    stage_name: str
    lead_count: int
    total_value: float
    average_deal_size: float
    stage_velocity_days: float
    bottleneck_risk: str  # "low", "medium", "high"
    forecasted_close_rate: float

class GeographicInsights(BaseModel):
    country: str
    region: Optional[str]
    city: Optional[str]
    lead_count: int
    deal_count: int
    total_revenue: float
    average_deal_size: float
    conversion_rate: float
    market_penetration: float

class SectorAnalysis(BaseModel):
    sector: str
    lead_count: int
    deal_count: int
    total_revenue: float
    average_deal_size: float
    conversion_rate: float
    growth_rate: float
    market_share: float

class ComprehensiveAnalytics(BaseModel):
    kpi_metrics: List[KPIMetric]
    conversion_funnel: List[ConversionFunnelStage]
    user_performance: List[UserPerformanceDetail]
    lead_sources: List[LeadSourceMetrics]
    pipeline_health: List[PipelineHealthMetrics]
    geographic_insights: List[GeographicInsights]
    sector_analysis: List[SectorAnalysis]
    summary_insights: Dict[str, Any]

class ActivityReport(BaseModel):
    user_name: str
    user_email: str
    total_activities: int
    calls_made: int
    meetings_held: int
    emails_sent: int
    tasks_completed: int
    average_response_time: float
    activity_success_rate: float
    
class SalesForecasting(BaseModel):
    period: str  # "month", "quarter"
    forecasted_revenue: float
    confidence_level: float
    pipeline_value: float
    expected_deals: int
    risk_factors: List[str]

@router.get("/analytics/comprehensive", response_model=DetailedAnalytics)
def get_comprehensive_analytics(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    include_team: bool = Query(True)
):
    """Get comprehensive analytics report"""
    
    if not start_date:
        start_date = datetime.now() - timedelta(days=90)
    if not end_date:
        end_date = datetime.now()
    
    organization_id = current_user.organization_id  # Use current user's organization
    
    # Lead Sources Analysis
    lead_sources = db.query(
        Lead.source,
        func.count(Lead.id).label('total_leads'),
        func.sum(case((Lead.stage_id.isnot(None), 1), else_=0)).label('qualified_leads'),
        func.sum(case((Lead.estimated_value.isnot(None), Lead.estimated_value), else_=0)).label('total_value')
    ).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
        Lead.created_at >= start_date,
        Lead.created_at <= end_date
    ).group_by(Lead.source).all()
    
    # Convert to response format
    lead_source_reports = []
    for source_data in lead_sources:
        total_leads = source_data.total_leads
        qualified_leads = source_data.qualified_leads
        conversion_rate = (qualified_leads / total_leads * 100) if total_leads > 0 else 0
        
        lead_source_reports.append(LeadSourceReport(
            source=source_data.source or "Unknown",
            total_leads=total_leads,
            qualified_leads=qualified_leads,
            conversion_rate=conversion_rate,
            total_value=float(source_data.total_value or 0)
        ))
    
    # Sales Funnel Analysis
    funnel_stages = db.query(LeadStage).filter(
        LeadStage.organization_id == organization_id
    ).order_by(LeadStage.order).all()

    funnel_reports = []
    for stage in funnel_stages:
        leads_in_stage = db.query(func.count(Lead.id)).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.stage_id == stage.id,
        Lead.created_at >= start_date,
        Lead.created_at <= end_date
        ).scalar()

        # Calculate average time in stage (simplified)
        avg_time = 5.0  # Placeholder

        funnel_reports.append(SalesFunnelReport(
            stage_name=stage.name,
            lead_count=leads_in_stage,
            conversion_rate=85.0,  # Placeholder
            average_time_in_stage=avg_time,
            drop_off_rate=15.0  # Placeholder
        ))

    # User Performance
    _purge_leads_owned_by_deleted_users(db, organization_id)
    users = _org_active_users(db, organization_id)
    user_reports = []
    
    for user in users:
        # Total leads assigned to user
        total_leads = db.query(func.count(Lead.id)).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.user_id == user.id,
            Lead.created_at >= start_date,
            Lead.created_at <= end_date
        ).scalar() or 0
        
        # Qualified leads
        qualified_leads = db.query(func.count(Lead.id)).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.user_id == user.id,
            Lead.stage_id.isnot(None),
        Lead.created_at >= start_date,
        Lead.created_at <= end_date
        ).scalar() or 0
        
        # Deals created
        deals_created = db.query(func.count(Deal.id)).filter(
            Deal.organization_id == organization_id,
            Deal.assigned_to_id == user.id,
            Deal.created_at >= start_date,
            Deal.created_at <= end_date
        ).scalar() or 0
        
        # Deals won
        deals_won = db.query(func.count(Deal.id)).filter(
            Deal.organization_id == organization_id,
            Deal.assigned_to_id == user.id,
            Deal.status == "Closed_Won",
            Deal.updated_at >= start_date,
            Deal.updated_at <= end_date
        ).scalar() or 0
        
        # Deals lost
        deals_lost = db.query(func.count(Deal.id)).filter(
            Deal.organization_id == organization_id,
            Deal.assigned_to_id == user.id,
            Deal.status == "Closed_Lost",
            Deal.updated_at >= start_date,
            Deal.updated_at <= end_date
        ).scalar() or 0
        
        # Total revenue
        total_revenue = db.query(func.sum(Deal.amount)).filter(
            Deal.organization_id == organization_id,
            Deal.assigned_to_id == user.id,
            Deal.status == "Closed_Won",
            Deal.updated_at >= start_date,
            Deal.updated_at <= end_date
        ).scalar() or 0
        
        # Activities count
        activities_count = db.query(func.count(Activity.id)).filter(
            Activity.organization_id == organization_id,
            Activity.user_id == user.id,
            Activity.created_at >= start_date,
            Activity.created_at <= end_date
        ).scalar() or 0
        
        # Calculated metrics
        conversion_rate = (qualified_leads / total_leads * 100) if total_leads > 0 else 0
        average_deal_size = (total_revenue / deals_won) if deals_won > 0 else 0
        response_time_hours = 2.5  # Placeholder
        
        user_reports.append(PerformanceReport(
            user_name=user.full_name or user.email,
            user_email=user.email,
            total_leads=total_leads,
            qualified_leads=qualified_leads,
            deals_closed=deals_won,
            total_revenue=float(total_revenue),
            activities_completed=activities_count,
            tasks_completed=deals_won
        ))
    
    # Time Series Data (placeholder)
    time_series = []
    for i in range(30):
        date = start_date + timedelta(days=i)
        if date <= end_date:
            time_series.append(TimeSeriesData(
                date=date.strftime('%Y-%m-%d'),
                leads_created=10,
                deals_closed=2,
                revenue=5000,
                activities=15
            ))
    
    # Geographic Data (placeholder)
    geographic_data = [
        GeographicReport(
            country="Turkey",
            city="Istanbul",
            lead_count=100,
            deal_count=20,
            total_value=50000,
            conversion_rate=20.0
        )
    ]
    
    # Summary metrics
    total_leads = db.query(func.count(Lead.id)).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
        Lead.created_at >= start_date,
        Lead.created_at <= end_date
    ).scalar()
    
    summary_metrics = {
        "total_leads": total_leads,
        "total_revenue": sum(report.total_revenue for report in user_reports),
        "conversion_rate": 25.0,
        "active_users": len(users)
    }
    
    return DetailedAnalytics(
        lead_sources=lead_source_reports,
        sales_funnel=funnel_reports,
        user_performance=user_reports,
        time_series=time_series,
        geographic_data=geographic_data,
        summary_metrics=summary_metrics
    )

@router.get("/export/csv")
def export_analytics_csv(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    report_type: str = Query("leads"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None)
):
    """Export analytics data as CSV"""
    # Implementation placeholder
    return {"message": "CSV export functionality"}

@router.get("/lead-lifecycle")
def get_lead_lifecycle_analysis(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None)
):
    """Get detailed lead lifecycle analysis"""
    
    if not start_date:
        start_date = datetime.now() - timedelta(days=90)
    if not end_date:
        end_date = datetime.now()
    
    organization_id = current_user.organization_id  # Use current user's organization
    
    # Implementation placeholder
    return {
        "stages": [],
        "conversion_rates": [],
        "average_times": [],
        "bottlenecks": [],
        "recommendations": []
    }

@router.get("/kpi-dashboard-simple", response_model=Dict[str, Any])
def get_kpi_dashboard_simple(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None)
):
    """Get simplified KPI dashboard data using real database"""
    
    if not start_date:
        start_date = datetime.now() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now()
    
    organization_id = current_user.organization_id  # Use current user's organization
    
    # Previous period for comparison
    period_diff = end_date - start_date
    prev_start_date = start_date - period_diff
    prev_end_date = start_date
    
    def calculate_change_percentage(current, previous):
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return ((current - previous) / previous) * 100
    
    # Current period metrics
    current_leads = db.query(func.count(Lead.id)).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
        Lead.created_at >= start_date,
        Lead.created_at <= end_date
    ).scalar() or 0
    
    # Previous period metrics  
    previous_leads = db.query(func.count(Lead.id)).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
        Lead.created_at >= prev_start_date,
        Lead.created_at < prev_end_date
    ).scalar() or 0
    
    # "Qualified" leads (leads with stage assigned)
    current_qualified = db.query(func.count(Lead.id)).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
        Lead.stage_id.isnot(None),
        Lead.created_at >= start_date,
        Lead.created_at <= end_date
    ).scalar() or 0
    
    previous_qualified = db.query(func.count(Lead.id)).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
        Lead.stage_id.isnot(None),
        Lead.created_at >= prev_start_date,
        Lead.created_at < prev_end_date
    ).scalar() or 0
    
    # Total leads in database for this org
    total_leads_ever = db.query(func.count(Lead.id)).filter(
        Lead.organization_id == organization_id
    ).scalar() or 0
    
    # Conversion rate (qualified/total in period)
    current_conversion = (current_qualified / current_leads * 100) if current_leads > 0 else 0
    previous_conversion = (previous_qualified / previous_leads * 100) if previous_leads > 0 else 0
    
    kpi_metrics = [
        {
            "name": "Total Leads",
            "current_value": float(current_leads),
            "previous_value": float(previous_leads),
            "change_percentage": calculate_change_percentage(current_leads, previous_leads),
            "unit": "",
            "trend": "up" if current_leads > previous_leads else "down" if current_leads < previous_leads else "neutral"
        },
        {
            "name": "Qualified Leads", 
            "current_value": float(current_qualified),
            "previous_value": float(previous_qualified),
            "change_percentage": calculate_change_percentage(current_qualified, previous_qualified),
            "unit": "",
            "trend": "up" if current_qualified > previous_qualified else "down" if current_qualified < previous_qualified else "neutral"
        },
        {
            "name": "Total Database Leads",
            "current_value": float(total_leads_ever),
            "previous_value": float(total_leads_ever),
            "change_percentage": 0.0,
            "unit": "",
            "trend": "neutral"
        },
        {
            "name": "Conversion Rate",
            "current_value": current_conversion,
            "previous_value": previous_conversion,
            "change_percentage": calculate_change_percentage(current_conversion, previous_conversion),
            "unit": "%",
            "trend": "up" if current_conversion > previous_conversion else "down" if current_conversion < previous_conversion else "neutral"
        }
    ]
    
    return {
        "kpi_metrics": kpi_metrics,
        "period": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": (end_date - start_date).days
        },
        "organization_info": {
            "organization_id": organization_id,
            "total_leads_ever": total_leads_ever,
            "total_deals": 0,
            "note": "This organization has no deals in database"
        }
    }

@router.get("/conversion-funnel", response_model=List[ConversionFunnelStage])
def get_conversion_funnel(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None)
):
    """Get conversion funnel analysis"""
    
    if not start_date:
        start_date = datetime.now() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now()
    
    organization_id = current_user.organization_id  # Use current user's organization
    
    # Get lead stages ordered by sequence
    stages = db.query(LeadStage).filter(
        LeadStage.organization_id == organization_id
    ).order_by(LeadStage.order_index).all()
    
    funnel_data = []
    
    for i, stage in enumerate(stages):
        # Count leads in this stage
        leads_in_stage = db.query(func.count(Lead.id)).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.stage_id == stage.id,
            Lead.created_at >= start_date,
            Lead.created_at <= end_date
        ).scalar() or 0
        
        # Calculate conversion rate (leads in this stage / leads in previous stage)
        if i == 0:
            conversion_rate = 100.0
            drop_off_count = 0
        else:
            prev_stage_leads = funnel_data[i-1]["lead_count"] if funnel_data else 1
            conversion_rate = (leads_in_stage / prev_stage_leads * 100) if prev_stage_leads > 0 else 0
            drop_off_count = prev_stage_leads - leads_in_stage
        
        drop_off_rate = 100 - conversion_rate
        
        # Average time in stage (simplified calculation)
        average_time_days = float(i * 2 + 1)  # Placeholder calculation
        
        stage_data = ConversionFunnelStage(
            stage_name=stage.name,
            stage_order=i + 1,
            lead_count=leads_in_stage,
            conversion_rate=conversion_rate,
            drop_off_count=max(0, drop_off_count),
            drop_off_rate=drop_off_rate,
            average_time_days=average_time_days
        )
        
        funnel_data.append(stage_data)
    
    return funnel_data

@router.get("/user-performance", response_model=List[UserPerformanceDetail])
def get_user_performance(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    include_team: bool = Query(True)
):
    """Get detailed user performance metrics"""
    
    if not start_date:
        start_date = datetime.now() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now()
    
    organization_id = current_user.organization_id  # Use current user's organization

    _purge_leads_owned_by_deleted_users(db, organization_id)

    # Active users only (deleted/tombstoned excluded)
    users = _org_active_users(db, organization_id)
    
    performance_data = []
    
    for user in users:
        # Total leads assigned to user
        total_leads = db.query(func.count(Lead.id)).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.user_id == user.id,
        Lead.created_at >= start_date,
            Lead.created_at <= end_date
        ).scalar() or 0
        
        # Qualified leads
        qualified_leads = db.query(func.count(Lead.id)).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.user_id == user.id,
            Lead.stage_id.isnot(None),
            Lead.created_at >= start_date,
            Lead.created_at <= end_date
        ).scalar() or 0
        
        # Deals created
        deals_created = db.query(func.count(Deal.id)).filter(
            Deal.organization_id == organization_id,
            Deal.assigned_to_id == user.id,
        Deal.created_at >= start_date,
        Deal.created_at <= end_date
        ).scalar() or 0
        
        # Deals won
        deals_won = db.query(func.count(Deal.id)).filter(
            Deal.organization_id == organization_id,
            Deal.assigned_to_id == user.id,
            Deal.status == "Closed_Won",
            Deal.updated_at >= start_date,
            Deal.updated_at <= end_date
        ).scalar() or 0
        
        # Deals lost
        deals_lost = db.query(func.count(Deal.id)).filter(
            Deal.organization_id == organization_id,
            Deal.assigned_to_id == user.id,
            Deal.status == "Closed_Lost",
            Deal.updated_at >= start_date,
            Deal.updated_at <= end_date
        ).scalar() or 0
        
        # Total revenue
        total_revenue = db.query(func.sum(Deal.amount)).filter(
            Deal.organization_id == organization_id,
            Deal.assigned_to_id == user.id,
            Deal.status == "Closed_Won",
            Deal.updated_at >= start_date,
            Deal.updated_at <= end_date
        ).scalar() or 0
        
        # Activities count
        activities_count = db.query(func.count(Activity.id)).filter(
            Activity.organization_id == organization_id,
            Activity.user_id == user.id,
        Activity.created_at >= start_date,
        Activity.created_at <= end_date
        ).scalar() or 0
        
        # Tasks completed
        tasks_completed = db.query(func.count(Task.id)).filter(
            Task.organization_id == organization_id,
            Task.assigned_to_id == user.id,
            Task.status == "COMPLETED",
            Task.updated_at >= start_date,
            Task.updated_at <= end_date
        ).scalar() or 0
        
        # Calculated metrics
        conversion_rate = (qualified_leads / total_leads * 100) if total_leads > 0 else 0
        average_deal_size = (total_revenue / deals_won) if deals_won > 0 else 0
        response_time_hours = 2.5  # Placeholder
        
        performance_data.append(UserPerformanceDetail(
            user_id=user.id,
            user_name=user.full_name or user.email,
            user_email=user.email,
            total_leads=total_leads,
            qualified_leads=qualified_leads,
            deals_created=deals_created,
            deals_won=deals_won,
            deals_lost=deals_lost,
            total_revenue=float(total_revenue),
            conversion_rate=conversion_rate,
            average_deal_size=float(average_deal_size),
            activities_count=activities_count,
            tasks_completed=tasks_completed,
            response_time_hours=response_time_hours
        ))
    
    return performance_data

@router.get("/lead-sources", response_model=List[LeadSourceMetrics])
def get_lead_source_analysis(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None)
):
    """Get lead source performance analysis"""
    
    if not start_date:
        start_date = datetime.now() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now()
    
    organization_id = current_user.organization_id  # Use current user's organization
    
    # Group leads by source
    source_data = db.query(
        Lead.source,
        func.count(Lead.id).label('total_leads'),
        func.sum(case((Lead.stage_id.isnot(None), 1), else_=0)).label('qualified_leads')
    ).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
        Lead.created_at >= start_date,
        Lead.created_at <= end_date
    ).group_by(Lead.source).all()
    
    source_metrics = []
    
    for source_row in source_data:
        source_name = source_row.source or "Unknown"
        total_leads = source_row.total_leads
        qualified_leads = source_row.qualified_leads
        
        # Get deals created from leads of this source
        deals_created = db.query(func.count(Deal.id)).join(Lead).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.source == source_name,
            Deal.created_at >= start_date,
            Deal.created_at <= end_date
        ).scalar() or 0
        
        # Get deals won from leads of this source
        deals_won = db.query(func.count(Deal.id)).join(Lead).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.source == source_name,
            Deal.status == "Closed_Won",
            Deal.updated_at >= start_date,
            Deal.updated_at <= end_date
        ).scalar() or 0
        
        # Get total revenue from deals won
        total_revenue = db.query(func.sum(Deal.amount)).join(Lead).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.source == source_name,
            Deal.status == "Closed_Won",
            Deal.updated_at >= start_date,
            Deal.updated_at <= end_date
        ).scalar() or 0
        
        # Calculate metrics
        conversion_rate = (qualified_leads / total_leads * 100) if total_leads > 0 else 0
        cost_per_lead = 25.0  # Placeholder - would need cost data
        roi_percentage = ((total_revenue - (cost_per_lead * total_leads)) / (cost_per_lead * total_leads) * 100) if total_leads > 0 else 0
        quality_score = (deals_won / qualified_leads * 100) if qualified_leads > 0 else 0
        
        source_metrics.append(LeadSourceMetrics(
            source=source_name,
            total_leads=total_leads,
            qualified_leads=qualified_leads,
            deals_created=deals_created,
            deals_won=deals_won,
            total_revenue=float(total_revenue),
            cost_per_lead=cost_per_lead,
            roi_percentage=roi_percentage,
            conversion_rate=conversion_rate,
            quality_score=quality_score
        ))
    
    return source_metrics

@router.get("/pipeline-health", response_model=List[PipelineHealthMetrics])
def get_pipeline_health(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """Get pipeline health metrics"""
    
    organization_id = current_user.organization_id  # Use current user's organization
    
    # Get lead stages
    stages = db.query(LeadStage).filter(
        LeadStage.organization_id == organization_id
    ).order_by(LeadStage.order_index).all()
    
    pipeline_health = []
    
    for stage in stages:
        # Count leads in stage
        lead_count = db.query(func.count(Lead.id)).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.stage_id == stage.id
        ).scalar() or 0
        
        # Calculate total value of leads in stage (using placeholder since no value field exists)
        total_value = lead_count * 1000.0  # Placeholder calculation
        
        # Calculate average deal size
        average_deal_size = (total_value / lead_count) if lead_count > 0 else 0
        
        # Stage velocity (days) - simplified calculation
        stage_velocity_days = float(stage.order_index * 7)  # Placeholder
        
        # Determine bottleneck risk
        if lead_count > 50:
            bottleneck_risk = "high"
        elif lead_count > 20:
            bottleneck_risk = "medium"
        else:
            bottleneck_risk = "low"
        
        # Forecasted close rate
        forecasted_close_rate = max(0, 100 - (stage.order_index * 15))  # Decreases by stage
        
        pipeline_health.append(PipelineHealthMetrics(
            stage_name=stage.name,
            lead_count=lead_count,
            total_value=float(total_value),
            average_deal_size=float(average_deal_size),
            stage_velocity_days=stage_velocity_days,
            bottleneck_risk=bottleneck_risk,
            forecasted_close_rate=forecasted_close_rate
        ))
    
    return pipeline_health

@router.get("/geographic-insights", response_model=List[GeographicInsights])
def get_geographic_insights(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None)
):
    """Get geographic insights"""
    
    if not start_date:
        start_date = datetime.now() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now()
    
    organization_id = current_user.organization_id  # Use current user's organization

    # Group by region: prefer country, else location (many imports only set location).
    region_expr = func.coalesce(
        func.nullif(func.trim(Lead.country), ""),
        func.nullif(func.trim(Lead.location), ""),
        literal("Unknown"),
    )

    geographic_data = (
        db.query(region_expr.label("region"), func.count(Lead.id).label("lead_count"))
        .filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.created_at >= start_date,
            Lead.created_at <= end_date,
            or_(Lead.country.isnot(None), Lead.location.isnot(None)),
        )
        .group_by(region_expr)
        .all()
    )

    insights = []

    for geo_row in geographic_data:
        region = geo_row.region or "Unknown"
        lead_count = geo_row.lead_count

        deal_count = (
            db.query(func.count(Deal.id))
            .join(Lead, Deal.lead_id == Lead.id)
            .filter(
                Lead.organization_id == organization_id,
            _lead_alive(),
                Deal.organization_id == organization_id,
                region_expr == region,
                Deal.created_at >= start_date,
                Deal.created_at <= end_date,
            )
            .scalar()
            or 0
        )

        total_revenue = (
            db.query(func.sum(Deal.amount))
            .join(Lead, Deal.lead_id == Lead.id)
            .filter(
                Lead.organization_id == organization_id,
            _lead_alive(),
                Deal.organization_id == organization_id,
                region_expr == region,
                Deal.status == DealStatus.Closed_Won,
                Deal.updated_at >= start_date,
                Deal.updated_at <= end_date,
            )
            .scalar()
            or 0
        )

        average_deal_size = (float(total_revenue) / deal_count) if deal_count > 0 else 0
        conversion_rate = (deal_count / lead_count * 100) if lead_count > 0 else 0
        market_penetration = min(50.0, lead_count / 10)

        insights.append(
            GeographicInsights(
                country=region,
                region=None,
                city=None,
                lead_count=lead_count,
                deal_count=deal_count,
                total_revenue=float(total_revenue or 0),
                average_deal_size=float(average_deal_size),
                conversion_rate=conversion_rate,
                market_penetration=market_penetration,
            )
        )

    return insights

@router.get("/sector-analysis", response_model=List[SectorAnalysis])
def get_sector_analysis(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None)
):
    """Get sector/industry analysis"""
    
    if not start_date:
        start_date = datetime.now() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now()
    
    organization_id = current_user.organization_id  # Use current user's organization
    
    # Group by company (using company as sector)
    sector_data = db.query(
        Lead.company,
        func.count(Lead.id).label('lead_count')
    ).filter(
        Lead.organization_id == organization_id,
            _lead_alive(),
        Lead.created_at >= start_date,
        Lead.created_at <= end_date,
        Lead.company.isnot(None)
    ).group_by(Lead.company).all()
    
    analysis = []
    
    for sector_row in sector_data:
        sector = sector_row.company
        lead_count = sector_row.lead_count
        
        # Get deal count for this sector
        deal_count = db.query(func.count(Deal.id)).join(Lead).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.company == sector,
            Deal.created_at >= start_date,
            Deal.created_at <= end_date
        ).scalar() or 0
        
        # Get total revenue for this sector
        total_revenue = db.query(func.sum(Deal.amount)).join(Lead).filter(
            Lead.organization_id == organization_id,
            _lead_alive(),
            Lead.company == sector,
            Deal.status == "Closed_Won",
            Deal.updated_at >= start_date,
            Deal.updated_at <= end_date
        ).scalar() or 0
        
        # Calculate metrics
        average_deal_size = (total_revenue / deal_count) if deal_count > 0 else 0
        conversion_rate = (deal_count / lead_count * 100) if lead_count > 0 else 0
        growth_rate = 15.0  # Placeholder - would need historical data
        market_share = min(30.0, lead_count / 50)  # Placeholder calculation
        
        analysis.append(SectorAnalysis(
            sector=sector,
            lead_count=lead_count,
            deal_count=deal_count,
            total_revenue=float(total_revenue),
            average_deal_size=float(average_deal_size),
            conversion_rate=conversion_rate,
            growth_rate=growth_rate,
            market_share=market_share
        ))
    
    return analysis

@router.get("/activity-performance", response_model=List[ActivityReport])
def get_activity_performance(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    include_team: bool = Query(True)
):
    """Get activity performance metrics"""
    
    if not start_date:
        start_date = datetime.now() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now()
    
    organization_id = current_user.organization_id  # Use current user's organization

    _purge_leads_owned_by_deleted_users(db, organization_id)

    users = _org_active_users(db, organization_id)
    
    activity_reports = []
    
    for user in users:
        # Total activities
        total_activities = db.query(func.count(Activity.id)).filter(
            Activity.organization_id == organization_id,
            Activity.user_id == user.id,
        Activity.created_at >= start_date,
        Activity.created_at <= end_date
        ).scalar() or 0
        
        # Activity type counts from real data
        calls_made = db.query(func.count(Activity.id)).filter(
            Activity.organization_id == organization_id,
            Activity.user_id == user.id,
            Activity.type == 'CALL',
            Activity.created_at >= start_date,
            Activity.created_at <= end_date
        ).scalar() or 0
        
        meetings_held = db.query(func.count(Activity.id)).filter(
            Activity.organization_id == organization_id,
            Activity.user_id == user.id,
            Activity.type == 'MEETING',
            Activity.created_at >= start_date,
            Activity.created_at <= end_date
        ).scalar() or 0
        
        emails_sent = db.query(func.count(Activity.id)).filter(
            Activity.organization_id == organization_id,
            Activity.user_id == user.id,
            Activity.type == 'EMAIL',
            Activity.created_at >= start_date,
            Activity.created_at <= end_date
        ).scalar() or 0
        
        # Tasks completed
        tasks_completed = db.query(func.count(Task.id)).filter(
            Task.organization_id == organization_id,
            Task.assigned_to_id == user.id,
            Task.status == "COMPLETED",
            Task.updated_at >= start_date,
            Task.updated_at <= end_date
        ).scalar() or 0
        
        # Activity success rate (placeholder)
        activity_success_rate = min(95.0, 60.0 + (total_activities / 10))
        
        # Average response time
        average_response_time = 2.5  # Placeholder
        
        activity_reports.append(ActivityReport(
            user_name=user.full_name or user.email,
            user_email=user.email,
            total_activities=total_activities,
            calls_made=calls_made,
            meetings_held=meetings_held,
            emails_sent=emails_sent,
            tasks_completed=tasks_completed,
            average_response_time=average_response_time,
            activity_success_rate=activity_success_rate
        ))
    
    return activity_reports 

@router.get("/test-db")
def test_database_connection(db: Session = Depends(deps.get_db)):
    """Test database connection and basic queries"""
    try:
        # Test basic connection
        db.execute(text("SELECT 1"))
        
        # Test leads table
        organization_id = 11
        leads_count = db.query(func.count(Lead.id)).filter(
            Lead.organization_id == organization_id
        ).scalar()
        
        # Test users table  
        users_count = db.query(func.count(User.id)).filter(
            User.organization_id == organization_id
        ).scalar()
        
        return {
            "status": "success",
            "organization_id": organization_id,
            "leads_count": leads_count,
            "users_count": users_count,
            "message": "Database connection working"
        }
    except Exception as e:
        logger.error(f"Database test error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/debug-kpi")
def debug_kpi_dashboard(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Debug KPI dashboard - test each query separately"""
    try:
        organization_id = current_user.organization_id  # Use current user's organization
        current_leads = db.query(func.count(Lead.id)).filter(
            Lead.organization_id == organization_id
        ).scalar() or 0
        
        result = {"status": "success", "current_leads": current_leads}
        
        # Test 2: Qualified leads count  
        try:
            current_qualified = db.query(func.count(Lead.id)).filter(
                Lead.organization_id == organization_id,
            _lead_alive(),
                Lead.stage_id.isnot(None)
            ).scalar() or 0
            result["current_qualified"] = current_qualified
        except Exception as e:
            result["qualified_error"] = str(e)
        
        # Test 3: Revenue from deals
        try:
            current_revenue = db.query(func.sum(Deal.amount)).filter(
                Deal.organization_id == organization_id,
                Deal.status == "Closed_Won"
            ).scalar() or 0
            result["current_revenue"] = float(current_revenue)
        except Exception as e:
            result["revenue_error"] = str(e)
        
        return result
        
    except Exception as e:
        logger.error(f"Debug KPI error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Debug error: {str(e)}") 