from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.models.user import User
from typing import Dict, Any, List, Optional
from sqlalchemy import func, and_, text, inspect
from app.models.lead import Lead
from app.models.task import Task, TaskStatus
from app.models.deal import Deal, DealStatus
from app.models.event import Event
from app.models.activity import Activity
from datetime import datetime, timedelta
import logging

router = APIRouter(redirect_slashes=False)

# Cache schema introspection once per process — avoid inspect() on every /stats request
_cached_table_names: Optional[set] = None
_cached_org_columns: Optional[set] = None


def _table_names(db: Session) -> set:
    global _cached_table_names
    if _cached_table_names is None:
        try:
            _cached_table_names = set(inspect(db.get_bind()).get_table_names())
        except Exception:
            # Known app tables — prefer querying and catching over re-inspecting
            _cached_table_names = {
                "tasks", "deals", "activities", "organizations", "leads", "events",
            }
    return _cached_table_names


def _org_column_names(db: Session) -> set:
    global _cached_org_columns
    if _cached_org_columns is None:
        try:
            if "organizations" in _table_names(db):
                _cached_org_columns = {
                    c["name"] for c in inspect(db.get_bind()).get_columns("organizations")
                }
            else:
                _cached_org_columns = set()
        except Exception:
            _cached_org_columns = {"credit_balance", "id"}
    return _cached_org_columns


def _utc_midnight(d: datetime) -> datetime:
    return datetime(d.year, d.month, d.day)


def _lead_trend_last_7_days(db: Session, org_filter, now: datetime) -> List[Dict[str, Any]]:
    """
    Daily new-lead counts (UTC calendar days) for the last 7 days, oldest → newest.
    One GROUP BY query; missing days filled with 0.
    """
    today_start = _utc_midnight(now)
    range_start = today_start - timedelta(days=6)
    range_end = today_start + timedelta(days=1)
    try:
        dialect = db.get_bind().dialect.name
    except Exception:
        dialect = "postgresql"
    if dialect == "postgresql":
        day_bucket = func.date_trunc("day", Lead.created_at)
    else:
        day_bucket = func.date(Lead.created_at)
    rows = (
        db.query(day_bucket.label("day"), func.count(Lead.id))
        .filter(
            and_(
                org_filter,
                Lead.created_at >= range_start,
                Lead.created_at < range_end,
            )
        )
        .group_by(day_bucket)
        .all()
    )
    counts: Dict[str, int] = {}
    for day_val, cnt in rows:
        if day_val is None:
            continue
        if hasattr(day_val, "year") and hasattr(day_val, "month"):
            # date or datetime
            key = datetime(day_val.year, day_val.month, day_val.day).isoformat() + "Z"
        else:
            key = str(day_val)[:10] + "T00:00:00Z"
        counts[key] = int(cnt or 0)

    trend: List[Dict[str, Any]] = []
    for offset in range(6, -1, -1):
        day_start = today_start - timedelta(days=offset)
        key = day_start.isoformat() + "Z"
        trend.append({"date": key, "new_leads": counts.get(key, 0)})
    return trend


def _wow_pct_change(current: float, previous: float) -> Optional[float]:
    """Week-over-week % change: (current − previous) / previous × 100. None if both zero."""
    if previous == 0:
        return None if current == 0 else 100.0
    return round((current - previous) / previous * 100, 1)


@router.get("", response_model=Dict[str, Any])
@router.get("/", response_model=Dict[str, Any])
async def get_dashboard_data(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Dict[str, Any]:
    """
    Dashboard verilerini getir
    """
    # Temel bir dashboard veri yapısı dönelim
    return {
        "status": "success",
        "data": {
            "user_id": current_user.id,
            "message": "Dashboard API endpoint çalışıyor"
        }
    } 

@router.get("/stats", response_model=Dict[str, Any])
async def get_dashboard_stats(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
) -> Dict[str, Any]:
    """
    Get dashboard statistics.
    """
    logger = logging.getLogger(__name__)
    
    try:
        # Current time
        now = datetime.utcnow()
        
        # Basic time ranges for reference
        past_range = "30d"
        future_range = "next90d"
        
        # Organization bazlı filtreleme için temel koşul (exclude soft-deleted)
        org_filter = and_(
            Lead.organization_id == current_user.organization_id,
            Lead.is_deleted.is_(False),
        )
        tables = _table_names(db)

        # LEADS - Total count
        lead_count = db.query(func.count(Lead.id)).filter(org_filter).scalar() or 0
        
        # New leads today
        today_start = datetime(now.year, now.month, now.day).replace(hour=0, minute=0, second=0, microsecond=0)
        new_today = db.query(func.count(Lead.id)).filter(
            and_(
                org_filter,
                Lead.created_at >= today_start
            )
        ).scalar() or 0
        
        # New leads in last 30 days
        new_leads_30d = db.query(func.count(Lead.id)).filter(
            and_(
                org_filter,
                Lead.created_at >= now - timedelta(days=30)
            )
        ).scalar() or 0

        t7 = now - timedelta(days=7)
        t14 = now - timedelta(days=14)
        new_leads_last_7d = (
            db.query(func.count(Lead.id))
            .filter(and_(org_filter, Lead.created_at >= t7))
            .scalar()
            or 0
        )
        new_leads_prev_7d = (
            db.query(func.count(Lead.id))
            .filter(and_(org_filter, Lead.created_at >= t14, Lead.created_at < t7))
            .scalar()
            or 0
        )
        wow_new_leads_pct_change = _wow_pct_change(
            float(new_leads_last_7d), float(new_leads_prev_7d)
        )

        # WoW deal metrics (filled when deals table exists)
        pipeline_value_wow_pct_change: Optional[float] = None
        conversion_rate_wow_pp_change: Optional[float] = None
        
        # TASKS - Open tasks
        task_count = 0
        overdue_tasks = 0
        upcoming_tasks = 0
        try:
            if "tasks" in tables:
                task_org_filter = Task.organization_id == current_user.organization_id
                task_count = db.query(func.count(Task.id)).filter(
                    and_(
                        task_org_filter,
                        Task.status.in_(['PENDING', 'IN_PROGRESS'])
                    )
                ).scalar() or 0
                overdue_tasks = db.query(func.count(Task.id)).filter(
                    and_(
                        task_org_filter,
                        Task.status.in_(['PENDING', 'IN_PROGRESS']),
                        Task.due_date < now
                    )
                ).scalar() or 0
                upcoming_tasks = db.query(func.count(Task.id)).filter(
                    and_(
                        task_org_filter,
                        Task.due_date >= now,
                        Task.due_date <= now + timedelta(days=7),
                        Task.status != TaskStatus.COMPLETED
                    )
                ).scalar() or 0
        except Exception as e:
            logger.error(f"Error querying tasks: {str(e)}")
            task_count = 0
            overdue_tasks = 0
            upcoming_tasks = 0

        # DEALS
        deal_count = 0
        won_deals = 0
        conversion_rate = 0.0
        pipeline_value = 0.0
        total_revenue = 0.0
        monthly_revenue = 0.0
        try:
            if "deals" in tables:
                deal_org_filter = Deal.organization_id == current_user.organization_id
                deal_count = db.query(func.count(Deal.id)).filter(deal_org_filter).scalar() or 0
                won_deals = db.query(func.count(Deal.id)).filter(
                    and_(
                        deal_org_filter,
                        Deal.status == DealStatus.Closed_Won
                    )
                ).scalar() or 0
                if deal_count > 0:
                    conversion_rate = round((won_deals / deal_count) * 100, 2)
                pipeline_value = db.query(func.sum(Deal.amount)).filter(
                    and_(
                        deal_org_filter,
                        Deal.status.in_([DealStatus.Lead, DealStatus.Qualified, DealStatus.Proposal, DealStatus.Negotiation])
                    )
                ).scalar()
                pipeline_value = float(pipeline_value) if pipeline_value is not None else 0.0
                total_revenue = db.query(func.sum(Deal.amount)).filter(
                    and_(
                        deal_org_filter,
                        Deal.status == DealStatus.Closed_Won
                    )
                ).scalar()
                total_revenue = float(total_revenue) if total_revenue is not None else 0.0
                monthly_revenue = db.query(func.sum(Deal.amount)).filter(
                    and_(
                        deal_org_filter,
                        Deal.status == DealStatus.Closed_Won,
                        Deal.accepted_at >= now - timedelta(days=30)
                    )
                ).scalar()
                monthly_revenue = float(monthly_revenue) if monthly_revenue is not None else 0.0

                open_statuses = [
                    DealStatus.Lead,
                    DealStatus.Qualified,
                    DealStatus.Proposal,
                    DealStatus.Negotiation,
                ]
                pn7 = db.query(func.sum(Deal.amount)).filter(
                    and_(
                        deal_org_filter,
                        Deal.status.in_(open_statuses),
                        Deal.created_at >= t7,
                    )
                ).scalar()
                pn7 = float(pn7) if pn7 is not None else 0.0
                pn_prev = db.query(func.sum(Deal.amount)).filter(
                    and_(
                        deal_org_filter,
                        Deal.status.in_(open_statuses),
                        Deal.created_at >= t14,
                        Deal.created_at < t7,
                    )
                ).scalar()
                pn_prev = float(pn_prev) if pn_prev is not None else 0.0
                pipeline_value_wow_pct_change = _wow_pct_change(pn7, pn_prev)

                closed_ts = func.coalesce(
                    Deal.accepted_at, Deal.rejected_at, Deal.updated_at, Deal.created_at
                )
                w7 = (
                    db.query(func.count(Deal.id))
                    .filter(
                        and_(
                            deal_org_filter,
                            Deal.status == DealStatus.Closed_Won,
                            closed_ts >= t7,
                            closed_ts < now,
                        )
                    )
                    .scalar()
                    or 0
                )
                l7 = (
                    db.query(func.count(Deal.id))
                    .filter(
                        and_(
                            deal_org_filter,
                            Deal.status == DealStatus.Closed_Lost,
                            closed_ts >= t7,
                            closed_ts < now,
                        )
                    )
                    .scalar()
                    or 0
                )
                w_prev = (
                    db.query(func.count(Deal.id))
                    .filter(
                        and_(
                            deal_org_filter,
                            Deal.status == DealStatus.Closed_Won,
                            closed_ts >= t14,
                            closed_ts < t7,
                        )
                    )
                    .scalar()
                    or 0
                )
                l_prev = (
                    db.query(func.count(Deal.id))
                    .filter(
                        and_(
                            deal_org_filter,
                            Deal.status == DealStatus.Closed_Lost,
                            closed_ts >= t14,
                            closed_ts < t7,
                        )
                    )
                    .scalar()
                    or 0
                )
                closed_7 = w7 + l7
                closed_prev = w_prev + l_prev
                wr7 = (w7 / closed_7) if closed_7 > 0 else 0.0
                wrp = (w_prev / closed_prev) if closed_prev > 0 else 0.0
                if closed_7 == 0 and closed_prev == 0:
                    conversion_rate_wow_pp_change = None
                else:
                    conversion_rate_wow_pp_change = round((wr7 - wrp) * 100, 2)
        except Exception as e:
            logger.error(f"Error querying deals: {str(e)}")
            deal_count = 0
            won_deals = 0
            conversion_rate = 0.0
            pipeline_value = 0.0
            total_revenue = 0.0
            monthly_revenue = 0.0

        # EVENTS
        event_count = db.query(func.count(Event.id)).filter(
            Event.organization_id == current_user.organization_id
        ).scalar() or 0
        upcoming_events = db.query(func.count(Event.id)).filter(
            Event.organization_id == current_user.organization_id,
            Event.start_date >= now,
            Event.start_date <= now + timedelta(days=7)
        ).scalar() or 0

        # ACTIVITIES
        recent_activities = []
        try:
            if "activities" in tables:
                activity_org_filter = Activity.organization_id == current_user.organization_id
                recent_activities = (
                    db.query(Activity)
                    .filter(activity_org_filter)
                    .order_by(Activity.created_at.desc())
                    .limit(10)
                    .all()
                )
        except Exception as e:
            logger.error(f"Error querying activities: {str(e)}")
            recent_activities = []

        activities = []

        recent_leads = db.query(Lead).filter(org_filter).order_by(Lead.created_at.desc()).limit(5).all()
        for lead in recent_leads:
            lead_name = f"{lead.first_name or ''} {lead.last_name or ''}".strip() or "New Lead"
            activities.append({
                "id": f"lead_{lead.id}",
                "title": f"New Lead Added - {lead_name}",
                "description": f"Source: {lead.source or 'Direct'}",
                "type": "lead",
                "created_at": lead.created_at.isoformat() if lead.created_at else now.isoformat(),
                "entity_id": str(lead.id)
            })

        recent_deals = []
        try:
            if "deals" in tables:
                deal_org_filter = Deal.organization_id == current_user.organization_id
                recent_deals = (
                    db.query(Deal)
                    .filter(deal_org_filter)
                    .order_by(Deal.created_at.desc())
                    .limit(5)
                    .all()
                )
        except Exception as e:
            logger.error(f"Error querying recent deals: {str(e)}")
            recent_deals = []

        for deal in recent_deals:
            activities.append({
                "id": f"deal_{deal.id}",
                "title": f"New Deal Created - {deal.name or 'Unnamed Deal'}",
                "description": f"Value: ${deal.amount or 0:,.2f}",
                "type": "deal",
                "created_at": deal.created_at.isoformat() if deal.created_at else now.isoformat(),
                "entity_id": str(deal.id)
            })

        for activity in recent_activities:
            activity_type = str(activity.type) if activity.type else "other"
            if activity_type.startswith("ActivityType."):
                activity_type = activity_type.replace("ActivityType.", "")
            activities.append({
                "id": str(activity.id),
                "title": activity.description or "Activity",
                "description": f"Activity type: {activity_type}",
                "type": activity_type.lower(),
                "created_at": activity.created_at.isoformat() if activity.created_at else now.isoformat(),
                "entity_id": str(activity.lead_id) if activity.lead_id else str(activity.deal_id) if activity.deal_id else None
            })

        activities = sorted(activities, key=lambda x: x["created_at"], reverse=True)[:10]

        lead_trend = _lead_trend_last_7_days(db, org_filter, now)
        task_trend: List[Dict[str, Any]] = []
        pipeline_trend: List[Dict[str, Any]] = []
        event_trend: List[Dict[str, Any]] = []

        credit_balance = 0.0
        try:
            if "organizations" in tables and "credit_balance" in _org_column_names(db):
                row = db.execute(
                    text("SELECT credit_balance FROM organizations WHERE id = :org_id"),
                    {"org_id": current_user.organization_id},
                ).fetchone()
                if row is not None and row[0] is not None:
                    credit_balance = float(row[0])
        except Exception as e:
            logger.warning("Could not load organization credit_balance: %s", e)
        
        # Log the values for debugging
        logger.info(f"Dashboard stats: Leads={lead_count}, Tasks={task_count}, Deals={deal_count}, Pipeline=${pipeline_value}")
        
        # FINAL RESPONSE - Ensure all data is correctly formatted for the frontend
        response_data = {
            "status": "success",
            "data": {
                "leads": {
                    "total": lead_count,
                    "new_today": new_today,
                    "new_leads": new_leads_30d,
                    "new_leads_last_7d": new_leads_last_7d,
                    "new_leads_prev_7d": new_leads_prev_7d,
                    "wow_new_leads_pct_change": wow_new_leads_pct_change,
                    "trend": lead_trend,
                    "trend_range": "7d",
                    "date_range": past_range
                },
                "tasks": {
                    "open": task_count,
                    "upcoming": upcoming_tasks,
                    "overdue": overdue_tasks,
                    "trend": task_trend,
                    "date_range": past_range
                },
                "deals": {
                    "total": deal_count,
                    "won": won_deals,
                    "conversion_rate": conversion_rate,
                    "date_range": future_range
                },
                "revenue": {
                    "total": round(total_revenue, 2),
                    "monthly": round(monthly_revenue, 2),
                    "pipeline": pipeline_value,
                    "trend": pipeline_trend,
                    "date_range": future_range
                },
                "events": {
                    "total": event_count,
                    "upcoming": upcoming_events,
                    "trend": event_trend,
                    "date_range": past_range
                },
                "user": {
                    # Backward compat: "tokens" previously hardcoded; now mirrors org credit balance.
                    "tokens": round(credit_balance, 2),
                    "credit_balance": round(credit_balance, 2),
                },
                "activities": activities,
                "opportunities": {
                    "total": deal_count,
                    "won": won_deals,
                    "conversion_rate": conversion_rate,
                    "pipeline_value": pipeline_value,
                    "pipeline_value_wow_pct_change": pipeline_value_wow_pct_change,
                    "conversion_rate_wow_pp_change": conversion_rate_wow_pp_change,
                    "pipeline_trend": pipeline_trend,
                    "date_range": future_range
                },
                "meetings": {
                    "upcoming": upcoming_events,
                    "trend": event_trend,
                    "date_range": past_range
                }
            }
        }
        
        # Debug log the response
        logger.info(f"Response data prepared successfully. Leads: {response_data['data']['leads']['total']}")
        
        return response_data
    except Exception as e:
        logger.error(f"Error retrieving dashboard stats: {str(e)}")
        # Include traceback for better debugging
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving dashboard stats: {str(e)}"
        ) 