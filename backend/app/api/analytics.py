from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from app.models.analytics import AnalyticsEvent
from app.core.logger import logger
from app.core.database import get_db
from sqlalchemy.orm import Session
from app.core.security import optional_get_current_user
from app.models.user import User

class AnalyticsEventCreate(BaseModel):
    name: str
    properties: dict
    timestamp: int
    user_id: Optional[str] = None
    session_id: str
    page_load_time: Optional[float] = None
    time_to_interactive: Optional[float] = None
    first_contentful_paint: Optional[float] = None
    largest_contentful_paint: Optional[float] = None
    cumulative_layout_shift: Optional[float] = None
    first_input_delay: Optional[float] = None
    api_response_time: Optional[float] = None
    api_status_code: Optional[int] = None
    api_endpoint: Optional[str] = None
    interaction_type: Optional[str] = None
    interaction_target: Optional[str] = None
    interaction_duration: Optional[float] = None
    user_agent: Optional[str] = None
    screen_resolution: Optional[str] = None
    viewport_size: Optional[str] = None
    connection_type: Optional[str] = None
    error_name: Optional[str] = None
    error_message: Optional[str] = None
    error_stack: Optional[str] = None
    error_context: Optional[dict] = None

router = APIRouter(redirect_slashes=False)

@router.post("/events")
async def store_analytics_events(
    events: List[AnalyticsEventCreate],
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(optional_get_current_user)
):
    """
    Frontend'den gelen analytics olaylarını saklar.
    """
    try:
        # Her olayı veritabanına kaydet
        for event in events:
            # If user is authenticated, use their ID
            user_id = str(current_user.id) if current_user else event.user_id
            
            event_db = AnalyticsEvent(
                name=event.name,
                properties=event.properties,
                timestamp=datetime.fromtimestamp(event.timestamp / 1000),
                user_id=user_id,
                session_id=event.session_id,
                page_load_time=event.page_load_time,
                time_to_interactive=event.time_to_interactive,
                first_contentful_paint=event.first_contentful_paint,
                largest_contentful_paint=event.largest_contentful_paint,
                cumulative_layout_shift=event.cumulative_layout_shift,
                first_input_delay=event.first_input_delay,
                api_response_time=event.api_response_time,
                api_status_code=event.api_status_code,
                api_endpoint=event.api_endpoint,
                interaction_type=event.interaction_type,
                interaction_target=event.interaction_target,
                interaction_duration=event.interaction_duration,
                user_agent=event.user_agent,
                screen_resolution=event.screen_resolution,
                viewport_size=event.viewport_size,
                connection_type=event.connection_type,
                error_name=event.error_name,
                error_message=event.error_message,
                error_stack=event.error_stack,
                error_context=event.error_context
            )
            db.add(event_db)
        
        # Değişiklikleri kaydet
        db.commit()

        # Log başarılı işlemi
        logger.info(
            f"Analytics events stored successfully",
            extra={
                "event_count": len(events),
                "first_event": events[0].name if events else None,
                "last_event": events[-1].name if events else None,
                "user_id": current_user.id if current_user else None
            }
        )

        return {"status": "success", "message": f"{len(events)} events stored"}

    except Exception as e:
        # Hata durumunda rollback yap
        db.rollback()
        
        # Hatayı logla
        logger.error(
            "Failed to store analytics events",
            extra={
                "error": str(e),
                "event_count": len(events),
                "user_id": current_user.id if current_user else None
            }
        )
        
        # Hatayı HTTP exception olarak fırlat
        raise HTTPException(
            status_code=500,
            detail="Failed to store analytics events"
        )
