from datetime import datetime, timedelta
import base64
import hashlib
import hmac
import json
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
import requests

from app.api import deps
from app.core.config import settings
from app.models.user import User
from app.models.calendar_integration import CalendarIntegration
from app.services.google_calendar_sync_service import GoogleCalendarSyncService
from app.schemas.calendar_integration import (
    CalendarIntegrationListResponse,
    OAuthInitRequest,
    OAuthInitResponse,
)

router = APIRouter(redirect_slashes=False)


def _sign_oauth_state(payload_b64: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _build_oauth_state(user_id: int, organization_id: int, purpose: str) -> str:
    payload = {
        "u": int(user_id),
        "o": int(organization_id),
        "p": purpose,
        "ts": int(datetime.utcnow().timestamp()),
    }
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")
    return f"{payload_b64}.{_sign_oauth_state(payload_b64)}"


def _parse_oauth_state(state: str, expected_purpose: str) -> dict:
    try:
        payload_b64, sig = state.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    if not hmac.compare_digest(sig, _sign_oauth_state(payload_b64)):
        raise HTTPException(status_code=400, detail="Invalid OAuth state signature")
    payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8"))
    if payload.get("p") != expected_purpose:
        raise HTTPException(status_code=400, detail="Invalid OAuth state purpose")
    if int(datetime.utcnow().timestamp()) - int(payload.get("ts", 0)) > 1800:
        raise HTTPException(status_code=400, detail="OAuth state expired")
    return payload


def _google_oauth_url(state: str) -> str:
    if not settings.GOOGLE_CALENDAR_CLIENT_ID or not settings.GOOGLE_CALENDAR_REDIRECT_URI:
        raise HTTPException(
            status_code=400,
            detail="Google Calendar OAuth is not configured. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_REDIRECT_URI.",
        )
    params = {
        "client_id": settings.GOOGLE_CALENDAR_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_CALENDAR_REDIRECT_URI,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "scope": settings.GOOGLE_CALENDAR_SCOPES,
        "state": state,
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


@router.get("", response_model=CalendarIntegrationListResponse)
@router.get("/", response_model=CalendarIntegrationListResponse)
def list_calendar_integrations(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    items = (
        db.query(CalendarIntegration)
        .filter(
            CalendarIntegration.organization_id == current_user.organization_id,
            CalendarIntegration.user_id == current_user.id,
            CalendarIntegration.is_active == True,
        )
        .order_by(CalendarIntegration.updated_at.desc())
        .all()
    )
    return CalendarIntegrationListResponse(items=items, total=len(items))


@router.post("/oauth/init", response_model=OAuthInitResponse)
def init_calendar_oauth(
    *,
    payload: OAuthInitRequest,
    current_user: User = Depends(deps.get_current_active_user),
):
    provider = (payload.provider or "google").lower().strip()
    if provider != "google":
        raise HTTPException(
            status_code=400,
            detail="Only Google OAuth init is enabled right now. Outlook/Apple/CalDAV are in next rollout.",
        )
    state = _build_oauth_state(current_user.id, current_user.organization_id, "calendar_google")
    return OAuthInitResponse(
        authorization_url=_google_oauth_url(state=state),
        provider="google",
    )


@router.get("/oauth/callback/google")
def calendar_google_oauth_callback(
    *,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(deps.get_db),
):
    redirect_base = f"{settings.FRONTEND_URL.rstrip('/')}/settings/integrations"
    if error:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&calendar_oauth=error&reason={error}")
    if not code or not state:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&calendar_oauth=error&reason=missing_code")

    parsed = _parse_oauth_state(state, "calendar_google")
    user_id = int(parsed["u"])
    organization_id = int(parsed["o"])

    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.GOOGLE_CALENDAR_CLIENT_ID,
            "client_secret": settings.GOOGLE_CALENDAR_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_CALENDAR_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    if token_response.status_code >= 400:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&calendar_oauth=error&reason=token_exchange")

    token_data = token_response.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = int(token_data.get("expires_in") or 3600)
    scopes = token_data.get("scope")
    if not access_token:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&calendar_oauth=error&reason=no_access_token")

    user_info_resp = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    provider_email = None
    provider_sub = None
    if user_info_resp.status_code < 400:
        info = user_info_resp.json()
        provider_email = info.get("email")
        provider_sub = info.get("id")

    integration = None
    if provider_sub:
        integration = (
            db.query(CalendarIntegration)
            .filter(
                CalendarIntegration.organization_id == organization_id,
                CalendarIntegration.user_id == user_id,
                CalendarIntegration.provider == "google",
                CalendarIntegration.external_account_id == provider_sub,
            )
            .first()
        )
    if not integration and provider_email:
        integration = (
            db.query(CalendarIntegration)
            .filter(
                CalendarIntegration.organization_id == organization_id,
                CalendarIntegration.user_id == user_id,
                CalendarIntegration.provider == "google",
                CalendarIntegration.provider_account_email == provider_email,
            )
            .first()
        )
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    if integration:
        integration.provider_account_email = provider_email or integration.provider_account_email
        integration.external_account_id = provider_sub or integration.external_account_id
        integration.access_token = access_token
        integration.refresh_token = refresh_token or integration.refresh_token
        integration.token_expires_at = expires_at
        integration.scopes = scopes
        integration.sync_enabled = True
        integration.last_error = None
        integration.updated_at = datetime.utcnow()
    else:
        integration = CalendarIntegration(
            organization_id=organization_id,
            user_id=user_id,
            provider="google",
            provider_account_email=provider_email,
            external_account_id=provider_sub,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=expires_at,
            scopes=scopes,
            sync_enabled=True,
            sync_direction="two_way",
            is_active=True,
        )
        db.add(integration)
    db.commit()
    return RedirectResponse(url=f"{redirect_base}?tab=integrations&calendar_oauth=success")


@router.post("/{integration_id}/disconnect")
def disconnect_calendar_integration(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    integration_id: int,
):
    integration = (
        db.query(CalendarIntegration)
        .filter(
            CalendarIntegration.id == integration_id,
            CalendarIntegration.organization_id == current_user.organization_id,
            CalendarIntegration.user_id == current_user.id,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    integration.is_active = False
    integration.sync_enabled = False
    integration.updated_at = datetime.utcnow()
    db.add(integration)
    db.commit()
    return {"success": True, "message": "Calendar integration disconnected"}


@router.post("/{integration_id}/sync")
def trigger_calendar_sync(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    integration_id: int,
):
    integration = (
        db.query(CalendarIntegration)
        .filter(
            CalendarIntegration.id == integration_id,
            CalendarIntegration.organization_id == current_user.organization_id,
            CalendarIntegration.user_id == current_user.id,
            CalendarIntegration.is_active == True,
        )
        .first()
    )
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    if integration.provider != "google":
        raise HTTPException(status_code=400, detail="Sync currently implemented for Google only")
    try:
        result = GoogleCalendarSyncService(db).sync_integration(integration)
        return {"success": True, "message": "Sync completed", "integration_id": integration.id, "result": result}
    except Exception as e:
        integration.last_error = str(e)
        integration.updated_at = datetime.utcnow()
        db.add(integration)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Calendar sync failed: {str(e)}")
