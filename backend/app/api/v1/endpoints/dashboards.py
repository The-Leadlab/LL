"""
Dashboard API Endpoints

Custom dashboards with widgets and real-time data visualization.
"""

from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.models.dashboard import Dashboard, DashboardWidget
from app.schemas.dashboard import (
    DashboardCreate, DashboardUpdate, DashboardResponse, DashboardSummary,
    WidgetCreate, WidgetUpdate, WidgetResponse,
    LayoutUpdate, WidgetData
)
from app.crud.crud_dashboard import crud_dashboard, crud_dashboard_widget

router = APIRouter(redirect_slashes=False)


# Dashboard Endpoints
@router.get("", response_model=List[DashboardSummary])
@router.get("/", response_model=List[DashboardSummary])
def list_dashboards(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    is_public: Optional[bool] = Query(None)
):
    """
    List all dashboards accessible by current user.

    Returns public dashboards and dashboards created by the user.
    """
    dashboards = crud_dashboard.get_user_dashboards(
        db,
        organization_id=current_user.organization_id,
        user_id=current_user.id
    )

    # Convert to summary format with widget count
    summaries = []
    for dashboard in dashboards:
        summary = DashboardSummary(
            id=dashboard.id,
            name=dashboard.name,
            description=dashboard.description,
            is_default=dashboard.is_default,
            is_public=dashboard.is_public,
            created_at=dashboard.created_at,
            widgets_count=len(dashboard.widgets) if dashboard.widgets else 0
        )
        summaries.append(summary)

    return summaries[skip:skip + limit]


@router.get("/default", response_model=DashboardResponse)
def get_default_dashboard(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get the default dashboard for the organization.
    """
    dashboard = crud_dashboard.get_default(db, current_user.organization_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="No default dashboard found")

    return dashboard


@router.get("/{dashboard_id}", response_model=DashboardResponse)
def get_dashboard(
    dashboard_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get dashboard by ID with all widgets.
    """
    dashboard = crud_dashboard.get(db, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check access permissions
    if not dashboard.is_public and dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return dashboard


@router.post("", response_model=DashboardResponse)
@router.post("/", response_model=DashboardResponse)
def create_dashboard(
    dashboard_in: DashboardCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Create new dashboard.

    Can include initial widgets in the creation request.
    """
    dashboard = crud_dashboard.create(
        db,
        obj_in=dashboard_in,
        organization_id=current_user.organization_id,
        created_by_id=current_user.id
    )

    return dashboard


@router.put("/{dashboard_id}", response_model=DashboardResponse)
def update_dashboard(
    dashboard_id: int,
    dashboard_in: DashboardUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update dashboard.
    """
    dashboard = crud_dashboard.get(db, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Only owner can update
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can update dashboard")

    dashboard = crud_dashboard.update(db, dashboard=dashboard, obj_in=dashboard_in)

    return dashboard


@router.put("/{dashboard_id}/layout", response_model=DashboardResponse)
def update_dashboard_layout(
    dashboard_id: int,
    layout_in: LayoutUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update dashboard grid layout.

    Used for drag-and-drop repositioning of widgets.
    """
    dashboard = crud_dashboard.get(db, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Only owner can update
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can update dashboard")

    # Convert layout items to dict format
    layout_data = [item.model_dump() for item in layout_in.layout]

    dashboard = crud_dashboard.update_layout(
        db,
        dashboard=dashboard,
        layout=layout_data
    )

    return dashboard


@router.delete("/{dashboard_id}")
def delete_dashboard(
    dashboard_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Delete dashboard.
    """
    dashboard = crud_dashboard.get(db, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Only owner can delete
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can delete dashboard")

    # Cannot delete default dashboard
    if dashboard.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete default dashboard")

    crud_dashboard.delete(db, dashboard_id=dashboard_id)

    return {"message": "Dashboard deleted successfully"}


@router.post("/{dashboard_id}/clone", response_model=DashboardResponse)
def clone_dashboard(
    dashboard_id: int,
    new_name: str = Query(..., description="Name for the cloned dashboard"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Clone a dashboard with all its widgets.

    Useful for creating templates or duplicating existing dashboards.
    """
    dashboard = crud_dashboard.get(db, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check access permissions
    if not dashboard.is_public and dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    cloned = crud_dashboard.clone(
        db,
        dashboard_id=dashboard_id,
        new_name=new_name,
        created_by_id=current_user.id
    )

    if not cloned:
        raise HTTPException(status_code=500, detail="Failed to clone dashboard")

    return cloned


# Widget Endpoints
@router.get("/{dashboard_id}/widgets", response_model=List[WidgetResponse])
def list_dashboard_widgets(
    dashboard_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    List all widgets in a dashboard.
    """
    dashboard = crud_dashboard.get(db, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check access permissions
    if not dashboard.is_public and dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    widgets = crud_dashboard_widget.get_by_dashboard(db, dashboard_id)

    return widgets


@router.post("/{dashboard_id}/widgets", response_model=WidgetResponse)
def create_widget(
    dashboard_id: int,
    widget_in: WidgetCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Add a widget to a dashboard.
    """
    dashboard = crud_dashboard.get(db, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Only owner can add widgets
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can add widgets")

    widget = crud_dashboard_widget.create(
        db,
        dashboard_id=dashboard_id,
        obj_in=widget_in
    )

    return widget


@router.put("/widgets/{widget_id}", response_model=WidgetResponse)
def update_widget(
    widget_id: int,
    widget_in: WidgetUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Update a widget configuration.
    """
    widget = crud_dashboard_widget.get(db, widget_id)

    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    # Check dashboard ownership
    dashboard = crud_dashboard.get(db, widget.dashboard_id)
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only dashboard owner can update widgets")

    widget = crud_dashboard_widget.update(db, widget=widget, obj_in=widget_in)

    return widget


@router.delete("/widgets/{widget_id}")
def delete_widget(
    widget_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Delete a widget from a dashboard.
    """
    widget = crud_dashboard_widget.get(db, widget_id)

    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    # Check dashboard ownership
    dashboard = crud_dashboard.get(db, widget.dashboard_id)
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only dashboard owner can delete widgets")

    crud_dashboard_widget.delete(db, widget_id=widget_id)

    return {"message": "Widget deleted successfully"}


@router.get("/widgets/{widget_id}/data", response_model=WidgetData)
def get_widget_data(
    widget_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Get data for a widget.

    Returns the actual data to be displayed based on widget configuration.
    The data structure varies based on widget type (chart, table, metric, list).
    """
    widget = crud_dashboard_widget.get(db, widget_id)

    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    # Check dashboard access
    dashboard = crud_dashboard.get(db, widget.dashboard_id)
    if not dashboard.is_public and dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get widget data based on configuration
    data = crud_dashboard_widget.get_widget_data(db, widget=widget)

    return WidgetData(**data)


@router.post("/{dashboard_id}/set-default", response_model=DashboardResponse)
def set_default_dashboard(
    dashboard_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    """
    Set a dashboard as the default for the organization.

    Requires admin permissions.
    """
    dashboard = crud_dashboard.get(db, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check if user is admin (implement your admin check logic)
    # For now, only allow dashboard owner
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only dashboard owner can set as default")

    dashboard = crud_dashboard.update(
        db,
        dashboard=dashboard,
        obj_in=DashboardUpdate(is_default=True)
    )

    return dashboard
