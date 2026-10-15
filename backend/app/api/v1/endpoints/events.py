from typing import Any, List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta, date
from uuid import uuid4
import requests
from app import crud, models, schemas
from app.api import deps
from app.schemas.event import Event, EventCreate, EventUpdate, EventListResponse
from zoneinfo import ZoneInfo, available_timezones
import logging
from app.models.calendar_integration import CalendarIntegration
from app.models.calendar_event_link import CalendarEventLink
from app.services.google_calendar_sync_service import GoogleCalendarSyncService

logger = logging.getLogger(__name__)

router = APIRouter(redirect_slashes=False)
MEETING_LINK_PREFIX = "[meeting-link]"
MEETING_LINK_SUFFIX = "[/meeting-link]"


def _normalize_event_type(event_type: Optional[str]) -> str:
    normalized = (event_type or "meeting").strip().lower()
    if normalized == "call":
        return "video_call"
    if normalized == "break":
        return "reminder"
    if normalized in {"meeting", "video_call", "task", "reminder"}:
        return normalized
    return "meeting"


def _extract_google_meet_link(payload: Dict[str, Any]) -> Optional[str]:
    if payload.get("hangoutLink"):
        return payload["hangoutLink"]
    conference_data = payload.get("conferenceData") or {}
    for entry in conference_data.get("entryPoints") or []:
        if (entry.get("entryPointType") or "").lower() == "video" and entry.get("uri"):
            return entry["uri"]
    return None


def _add_meeting_link_to_description(description: Optional[str], meet_link: str) -> str:
    body = (description or "").strip()
    if MEETING_LINK_PREFIX in body and MEETING_LINK_SUFFIX in body:
        return body
    return f"{MEETING_LINK_PREFIX}{meet_link}{MEETING_LINK_SUFFIX}\n{body}".strip()


def _try_attach_google_meet_link(db: Session, created_event: models.Event, current_user: models.User) -> None:
    # Only attach Google Meet for call-like events.
    if created_event.event_type not in ("call", "video_call"):
        return

    integration = (
        db.query(CalendarIntegration)
        .filter(
            CalendarIntegration.organization_id == current_user.organization_id,
            CalendarIntegration.user_id == current_user.id,
            CalendarIntegration.provider == "google",
            CalendarIntegration.is_active == True,
            CalendarIntegration.sync_enabled == True,
        )
        .order_by(CalendarIntegration.updated_at.desc())
        .first()
    )
    if not integration:
        return

    sync_service = GoogleCalendarSyncService(db)
    access_token = sync_service._refresh_access_token(integration)  # Reuse existing refresh logic.
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    event_payload = {
        "summary": created_event.title,
        "description": created_event.description or "",
        "location": created_event.location or "",
        "start": {"dateTime": created_event.start_date.isoformat(), "timeZone": created_event.timezone or "UTC"},
        "end": {"dateTime": created_event.end_date.isoformat(), "timeZone": created_event.timezone or "UTC"},
        "conferenceData": {
            "createRequest": {
                "requestId": f"leadlab-{created_event.id}-{uuid4().hex}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }
    google_resp = requests.post(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        headers=headers,
        json=event_payload,
        timeout=30,
    )
    if google_resp.status_code >= 400:
        logger.warning(
            "Google Meet auto-link creation failed",
            extra={"event_id": created_event.id, "status_code": google_resp.status_code, "body": google_resp.text[:500]},
        )
        return

    google_event = google_resp.json() or {}
    meet_link = _extract_google_meet_link(google_event)
    if meet_link:
        created_event.description = _add_meeting_link_to_description(created_event.description, meet_link)
        created_event.updated_at = datetime.now(timezone.utc)
        db.add(created_event)

    updated_raw = (google_event.get("updated") or "").replace("Z", "+00:00")
    external_id = google_event.get("id")
    if external_id:
        link = CalendarEventLink(
            integration_id=integration.id,
            organization_id=integration.organization_id,
            user_id=integration.user_id,
            event_id=created_event.id,
            external_event_id=external_id,
            external_calendar_id="primary",
            external_etag=google_event.get("etag"),
            last_external_updated_at=datetime.fromisoformat(updated_raw).replace(tzinfo=None) if updated_raw else None,
            last_internal_updated_at=created_event.updated_at.replace(tzinfo=None) if created_event.updated_at else None,
            last_synced_at=datetime.utcnow(),
            is_deleted=False,
        )
        db.add(link)
    db.commit()
    db.refresh(created_event)

def parse_date(date_str: str, timezone_str: Optional[str] = None) -> datetime:
    """Parse date string to datetime with provided timezone."""
    if isinstance(date_str, datetime):
        dt = date_str
    elif isinstance(date_str, date):
        dt = datetime.combine(date_str, datetime.min.time())
    else:
        try:
            dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except ValueError:
            try:
                dt = datetime.strptime(date_str, '%Y-%m-%d')
            except ValueError:
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid date format: {date_str}. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS+HH:MM)"
                )
    
    if not dt.tzinfo and timezone_str:
        try:
            dt = dt.replace(tzinfo=ZoneInfo(timezone_str))
        except Exception:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid timezone: {timezone_str}"
            )
    elif not dt.tzinfo:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

@router.get("/timezones", response_model=Dict[str, Any])
def list_timezones() -> Any:
    """
    Get list of available timezones and detect system timezone.
    """
    return {
        "timezones": list(available_timezones()),
        "system_timezone": None  # This will be set by frontend
    }

@router.get("", response_model=EventListResponse)
@router.get("/", response_model=EventListResponse)
def list_events(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    skip: int = 0,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD or ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD or ISO format)"),
    timezone: Optional[str] = Query(None, description="Timezone for the dates"),
) -> Any:
    """
    List events for the current user.
    """
    # Log the request parameters for debugging
    logger.debug(f"List events request: start_date={start_date}, end_date={end_date}, timezone={timezone}")
    
    # Process date parameters
    start_datetime = None
    end_datetime = None
    
    if start_date:
        start_datetime = parse_date(start_date, timezone)
    
    if end_date:
        end_datetime = parse_date(end_date, timezone)
    
    # Get events from database - using get_by_date_range instead of get_multi_by_date_range
    events = crud.event.get_by_date_range(
        db=db,
        organization_id=current_user.organization_id,
        start_date=start_datetime if start_datetime else datetime.now(timezone.utc),  # Default to now if None
        end_date=end_datetime if end_datetime else (datetime.now(timezone.utc) + timedelta(days=30))  # Default to +30 days
    )
    
    # Manuel olarak pagination uygula
    total = len(events)
    paginated_events = events[skip:skip+100] if skip < total else []
    
    # Convert model objects to schema objects
    event_schemas = [
        Event.from_orm(event)  
        for event in paginated_events
    ]
    
    return EventListResponse(
        items=event_schemas,
        total=total,
        skip=skip,
        limit=total
    )

@router.post("", response_model=Event)
@router.post("/", response_model=Event)
def create_event(
    *,
    db: Session = Depends(deps.get_db),
    event_in: EventCreate,
    current_user: models.User = Depends(deps.get_current_active_user)
) -> Any:
    """
    Create new event.
    """
    logger.debug(f"Received POST request to create event")
    
    try:
        # Log the incoming request
        logger.info(
            "Creating new event",
            extra={
                "user_id": current_user.id,
                "organization_id": current_user.organization_id,
                "event_data": event_in.dict(exclude={"attendee_ids"})
            }
        )
        
        # Set organization_id from current user
        event_in.organization_id = current_user.organization_id
        
        # Veriyi modele dönüştürmeden önce temizle
        event_data = event_in.dict()
        attendee_ids = event_data.pop("attendee_ids", None)  # attendee_ids'yi çıkar
        event_data["event_type"] = _normalize_event_type(event_data.get("event_type"))
        
        # ÖNEMLİ: Eksik/boş zorunlu alanları doldurma
        now = datetime.now(timezone.utc)
        
        # created_by mutlaka set edilmeli
        if "created_by" not in event_data or not event_data.get("created_by"):
            event_data["created_by"] = current_user.id
            
        # Tarih alanlarını set etme
        if "created_at" not in event_data or not event_data.get("created_at"):
            event_data["created_at"] = now
        if "updated_at" not in event_data or not event_data.get("updated_at"):
            event_data["updated_at"] = now
            
        # Validate start_date and end_date
        if event_data.get("start_date") and event_data.get("end_date"):
            if event_data["start_date"] > event_data["end_date"]:
                raise HTTPException(
                    status_code=422,
                    detail="Start date cannot be later than end date"
                )
        
        # Diğer gereksiz alanları da temizle
        for key in list(event_data.keys()):
            if not hasattr(models.Event, key):
                event_data.pop(key, None)
        
        # Veri kontrolü ve debug
        logger.debug(f"Creating event with data: {event_data}")
        
        # Önemli alanların varlığını kontrol et
        required_fields = ["title", "start_date", "end_date", "created_by", "created_at", "updated_at", "organization_id"]
        missing_fields = [field for field in required_fields if field not in event_data or event_data[field] is None]
        if missing_fields:
            raise HTTPException(
                status_code=422,
                detail=f"Required fields are missing or null: {', '.join(missing_fields)}"
            )
        
        try:
            # Temizlenmiş veriyle bir Event objesi oluştur
            event = models.Event(**event_data)
            db.add(event)
            db.commit()
            db.refresh(event)
            
            # Eğer attendee_ids varsa, ayrı işlemle EventAttendee kayıtları ekle
            if attendee_ids:
                # Validate attendee_ids
                valid_attendees = db.query(models.User).filter(
                    models.User.id.in_(attendee_ids),
                    models.User.organization_id == current_user.organization_id
                ).all()
                valid_attendee_ids = [user.id for user in valid_attendees]
                
                # Log any invalid attendee_ids
                invalid_attendee_ids = set(attendee_ids) - set(valid_attendee_ids)
                if invalid_attendee_ids:
                    logger.warning(
                        f"Some attendee_ids were invalid or from different organization",
                        extra={
                            "invalid_ids": list(invalid_attendee_ids),
                            "event_id": event.id
                        }
                    )
                
                for user_id in valid_attendee_ids:
                    attendee = models.EventAttendee(
                        event_id=event.id,
                        user_id=user_id,
                        status="pending",
                        created_at=now,
                        updated_at=now
                    )
                    db.add(attendee)
                db.commit()
                db.refresh(event)
            
            logger.info(
                "Event created successfully",
                extra={
                    "event_id": event.id,
                    "user_id": current_user.id,
                    "attendee_count": len(valid_attendee_ids) if attendee_ids else 0
                }
            )
            try:
                _try_attach_google_meet_link(db, event, current_user)
            except Exception as meet_error:
                # Event creation must still succeed even if Meet generation fails.
                logger.warning(
                    "Event created but Google Meet auto-link failed",
                    extra={"event_id": event.id, "user_id": current_user.id, "error": str(meet_error)},
                )
            
            return event
            
        except Exception as db_error:
            db.rollback()
            logger.error(
                "Database error while creating event",
                extra={
                    "error": str(db_error),
                    "user_id": current_user.id,
                    "event_data": event_data
                }
            )
            raise HTTPException(
                status_code=500,
                detail="Database error occurred while creating the event"
            )
            
    except HTTPException:
        # Re-raise HTTP exceptions as they are already properly formatted
        raise
        
    except Exception as e:
        logger.error(
            "Unexpected error while creating event",
            extra={
                "error": str(e),
                "user_id": current_user.id,
                "event_data": event_in.dict(exclude={"attendee_ids"})
            }
        )
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while creating the event"
        )

@router.put("/{id}", response_model=Event)
def update_event(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    event_in: EventUpdate,
    current_user: models.User = Depends(deps.get_current_active_user)
) -> Any:
    """
    Update an event.
    """
    event = crud.event.get(db=db, id=id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not crud.user.is_superuser(current_user) and (event.created_by != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
        
    # Convert dates to the specified timezone if provided
    if event_in.event_type is not None:
        event_in.event_type = _normalize_event_type(event_in.event_type)

    if hasattr(event_in, 'start_date') and event_in.start_date:
        if isinstance(event_in.start_date, str):
            event_in.start_date = parse_date(event_in.start_date, event_in.timezone or event.timezone)
    if hasattr(event_in, 'end_date') and event_in.end_date:
        if isinstance(event_in.end_date, str):
            event_in.end_date = parse_date(event_in.end_date, event_in.timezone or event.timezone)
        
    event = crud.event.update(db=db, db_obj=event, obj_in=event_in)
    return event

@router.get("/{id}", response_model=Event)
def read_event(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: models.User = Depends(deps.get_current_active_user)
) -> Any:
    """
    Get event by ID.
    """
    event = crud.event.get(db=db, id=id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not crud.user.is_superuser(current_user) and (event.organization_id != current_user.organization_id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    return event

@router.delete("/{id}", response_model=Event)
def delete_event(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: models.User = Depends(deps.get_current_active_user)
) -> Any:
    """
    Delete an event.
    """
    event = crud.event.get(db=db, id=id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not crud.user.is_superuser(current_user) and (event.created_by != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    event = crud.event.remove(db=db, id=id)
    return event

# Debug endpoint to test router
@router.get("/debug")
def debug_router():
    """Debug endpoint to test router configuration"""
    return {"status": "ok", "routes": [{"path": route.path, "methods": route.methods} for route in router.routes]}
