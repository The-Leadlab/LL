import logging
from typing import Any, Optional, List, Dict
from datetime import datetime, timedelta
import asyncio
import html as html_lib
import re
import base64
import hashlib
import hmac
import json
from urllib.parse import urlencode
import requests
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api import deps
from app.core.security import check_permission
from app.core.email import EmailSender
from app.models.email_account import EmailAccount, EmailProviderType, EmailSyncStatus
from app.models.email_message import Email, EmailDirection, EmailStatus, normalize_email_status
from app.models.user import User
from app.models.organization import Organization
from app.services.email_service import EmailService
from app.schemas.email import (
    EmailTemplateResponse,
    EmailTemplateListResponse,
    EmailLogResponse,
    EmailLogListResponse,
    SendEmailResponse,
    EmailStatus as EmailStatusSchema
)
from app.models.lead import Lead
from app.schemas.email_integration import (
    EmailAccountCreate, EmailAccountUpdate, EmailAccountOut,
    EmailOut, EmailSend, EmailSuggestion, OutreachSend
)
from app.core.config import settings
from app.core.security import encrypt_password

logger = logging.getLogger(__name__)

router = APIRouter()


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


def _parse_oauth_state(state: str, expected_purpose: str) -> Dict[str, Any]:
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


def _google_oauth_redirect_uri_for_email() -> str:
    return (
        settings.GOOGLE_EMAIL_REDIRECT_URI
        or settings.GOOGLE_CALENDAR_REDIRECT_URI
        or f"{settings.FRONTEND_URL.rstrip('/')}/settings/integrations"
    )


@router.post("/oauth/google/init")
def init_google_email_oauth(
    current_user: User = Depends(deps.get_current_active_user),
):
    if not settings.GOOGLE_CALENDAR_CLIENT_ID:
        raise HTTPException(status_code=400, detail="GOOGLE_CALENDAR_CLIENT_ID is not configured")
    redirect_uri = _google_oauth_redirect_uri_for_email()
    state = _build_oauth_state(current_user.id, current_user.organization_id, "email_google")
    params = {
        "client_id": settings.GOOGLE_CALENDAR_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "scope": settings.GOOGLE_EMAIL_SCOPES,
        "state": state,
    }
    return {
        "provider": "google",
        "authorization_url": f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}",
    }


@router.get("/oauth/google/callback")
def google_email_oauth_callback(
    *,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(deps.get_db),
):
    redirect_base = f"{settings.FRONTEND_URL.rstrip('/')}/settings/integrations"
    if error:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&email_oauth=error&reason={error}")
    if not code or not state:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&email_oauth=error&reason=missing_code")

    parsed = _parse_oauth_state(state, "email_google")
    user_id = int(parsed["u"])
    organization_id = int(parsed["o"])

    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.GOOGLE_CALENDAR_CLIENT_ID,
            "client_secret": settings.GOOGLE_CALENDAR_CLIENT_SECRET,
            "redirect_uri": _google_oauth_redirect_uri_for_email(),
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    if token_response.status_code >= 400:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&email_oauth=error&reason=token_exchange")
    token_data = token_response.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = int(token_data.get("expires_in") or 3600)
    scopes = token_data.get("scope")
    if not access_token:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&email_oauth=error&reason=no_access_token")

    profile_response = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    if profile_response.status_code >= 400:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&email_oauth=error&reason=userinfo")
    profile = profile_response.json()
    email_addr = profile.get("email")
    display_name = profile.get("name") or email_addr
    if not email_addr:
        return RedirectResponse(url=f"{redirect_base}?tab=integrations&email_oauth=error&reason=no_email")

    account = db.query(EmailAccount).filter(
        EmailAccount.email == email_addr,
        EmailAccount.organization_id == organization_id,
    ).first()
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    if account:
        account.user_id = user_id
        account.provider_type = EmailProviderType.GMAIL.value
        account.display_name = display_name
        account.auth_type = "oauth"
        account.oauth_access_token = access_token
        account.oauth_refresh_token = refresh_token or account.oauth_refresh_token
        account.oauth_token_expires_at = expires_at
        account.oauth_scopes = scopes
        account.imap_host = "imap.gmail.com"
        account.imap_port = 993
        account.imap_use_ssl = True
        account.smtp_host = "smtp.gmail.com"
        account.smtp_port = 465
        account.smtp_use_tls = False
        account.sync_enabled = True
        account.sync_status = EmailSyncStatus.ACTIVE.value
    else:
        account = EmailAccount(
            email=email_addr,
            display_name=display_name,
            provider_type=EmailProviderType.GMAIL.value,
            organization_id=organization_id,
            user_id=user_id,
            password_encrypted=encrypt_password("oauth_google_managed"),
            auth_type="oauth",
            oauth_access_token=access_token,
            oauth_refresh_token=refresh_token,
            oauth_token_expires_at=expires_at,
            oauth_scopes=scopes,
            imap_host="imap.gmail.com",
            imap_port=993,
            imap_use_ssl=True,
            smtp_host="smtp.gmail.com",
            smtp_port=465,
            smtp_use_tls=False,
            sync_status=EmailSyncStatus.ACTIVE.value,
            sync_enabled=True,
            sync_frequency_minutes=15,
            sync_sent_items=True,
            sync_inbox=True,
            days_to_sync=30,
            auto_create_contacts=True,
            auto_create_tasks=True,
        )
        db.add(account)

    db.commit()
    db.refresh(account)
    try:
        EmailService(db).sync_account_emails(account.id, days_back=365)
    except Exception as sync_err:
        logger.warning("Initial Gmail sync failed after OAuth callback: %s", sync_err)
    return RedirectResponse(url=f"{redirect_base}?tab=integrations&email_oauth=success")

async def send_email_background(
    db: Session,
    log_id: int,
    to_email: str,
    subject: str,
    body: str
) -> None:
    """Background task for sending emails"""
    try:
        # Get email log
        log = crud.email_log.get(db, log_id)
        if not log:
            return

        # Send email
        email_sender = EmailSender()
        await email_sender.send_email(
            to_email=to_email,
            subject=subject,
            html_content=body
        )

        # Update log status
        crud.email_log.update(
            db,
            db_obj=log,
            obj_in={"status": schemas.email.EmailStatus.SENT}
        )

    except Exception as e:
        # Update log with error status
        if log:
            crud.email_log.update(
                db,
                db_obj=log,
                obj_in={
                    "status": schemas.email.EmailStatus.FAILED,
                    "error_message": str(e)
                }
            )


@router.get("/templates", response_model=EmailTemplateListResponse)
def list_templates(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    skip: int = 0,
    limit: int = 10,
    name: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> Any:
    """
    List email templates with filtering and pagination.
    """

    filters = {}
    if name:
        filters["name"] = name
    if is_active is not None:
        filters["is_active"] = is_active

    templates = crud.email_template.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        filters=filters
    )

    return {
        "success": True,
        "message": "Email templates retrieved successfully",
        "data": templates
    }


@router.post("/templates", response_model=EmailTemplateResponse)
def create_template(
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    template_in: schemas.EmailTemplateCreate,
) -> Any:
    """
    Create new email template.
    """

    template = crud.email_template.create(db, obj_in=template_in)
    return {
        "success": True,
        "message": "Email template created successfully",
        "data": template
    }


@router.get("/templates/{id}", response_model=EmailTemplateResponse)
def get_template(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get email template by ID.
    """

    template = crud.email_template.get(db, id)
    if not template:
        raise HTTPException(
            status_code=404,
            detail="Email template not found"
        )

    if template.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this template"
        )

    return {
        "success": True,
        "message": "Email template retrieved successfully",
        "data": template
    }


@router.put("/templates/{id}", response_model=EmailTemplateResponse)
def update_template(
    id: int,
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    template_in: schemas.EmailTemplateUpdate,
) -> Any:
    """
    Update email template.
    """

    template = crud.email_template.get(db, id)
    if not template:
        raise HTTPException(
            status_code=404,
            detail="Email template not found"
        )

    if template.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to modify this template"
        )

    template = crud.email_template.update(
        db, db_obj=template, obj_in=template_in
    )

    return {
        "success": True,
        "message": "Email template updated successfully",
        "data": template
    }


@router.delete("/templates/{id}", response_model=EmailTemplateResponse)
def delete_template(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Delete email template.
    """

    template = crud.email_template.get(db, id)
    if not template:
        raise HTTPException(
            status_code=404,
            detail="Email template not found"
        )

    if template.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to delete this template"
        )

    template = crud.email_template.remove(db, id=id)
    return {
        "success": True,
        "message": "Email template deleted successfully",
        "data": template
    }


@router.post("/send", response_model=Dict[str, Any])
async def send_email(
    email_data: schemas.email_integration.EmailSend,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Send an email"""
    email_service = EmailService(db)
    
    # Get account
    account = db.query(EmailAccount).filter(
        EmailAccount.id == email_data.account_id,
        EmailAccount.user_id == current_user.id,
        EmailAccount.organization_id == current_user.organization_id
    ).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="Email account not found")
    
    try:
        send_result = email_service.send_email(
            account_id=email_data.account_id,
            to_emails=email_data.to_emails,
            subject=email_data.subject,
            body_text=email_data.body_text,
            body_html=email_data.body_html,
            cc_emails=email_data.cc_emails,
            bcc_emails=email_data.bcc_emails,
            reply_to=email_data.reply_to
        )
    except Exception as e:
        logger.error("Unexpected send_email error for account %s: %s", email_data.account_id, str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "SEND_INTERNAL_ERROR", "message": "Unexpected email send failure", "retryable": True},
        )

    if send_result.get("sent"):
        return {
            "message": "Email sent successfully",
            "transport": send_result.get("transport") or getattr(settings, "EMAIL_PROVIDER", "auto").lower(),
            "sent": True,
            "persisted": bool(send_result.get("persisted", True)),
            "warning": send_result.get("warning"),
        }

    detail = {
        "code": email_service.last_send_error_code or "DELIVERY_FAILED",
        "message": email_service.last_send_error or "Email delivery failed",
        "retryable": email_service.last_send_retryable,
    }
    raise HTTPException(
        status_code=email_service.last_send_status_code or status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=detail
    )


_TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def _lead_tokens(lead: Lead) -> Dict[str, str]:
    first = (lead.first_name or "").strip()
    last = (lead.last_name or "").strip()
    full = f"{first} {last}".strip()
    return {
        "first_name": first,
        "last_name": last,
        "full_name": full,
        "company": (lead.company or "").strip(),
        "email": (lead.email or "").strip(),
        "job_title": (lead.job_title or "").strip(),
    }


def _apply_outreach_tokens(template: str, tokens: Dict[str, str], as_html: bool) -> str:
    def repl(match: re.Match) -> str:
        key = match.group(1).lower()
        value = tokens.get(key, "")
        return html_lib.escape(value) if as_html else value

    return _TOKEN_RE.sub(repl, template or "")


@router.post("/outreach")
async def send_cold_outreach(
    outreach: OutreachSend,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """Send one personalized email to each selected lead via a connected mailbox."""
    account = db.query(EmailAccount).filter(
        EmailAccount.id == outreach.account_id,
        EmailAccount.user_id == current_user.id,
        EmailAccount.organization_id == current_user.organization_id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Email account not found")

    leads = (
        db.query(Lead)
        .filter(
            Lead.id.in_(outreach.lead_ids),
            Lead.organization_id == current_user.organization_id,
            Lead.is_deleted.is_(False),
        )
        .all()
    )
    by_id = {lead.id: lead for lead in leads}
    email_service = EmailService(db)
    as_html = outreach.format == "html"
    results: List[Dict[str, Any]] = []
    sent = 0
    failed = 0
    skipped = 0

    for index, lead_id in enumerate(outreach.lead_ids):
        lead = by_id.get(lead_id)
        if not lead:
            skipped += 1
            results.append({"lead_id": lead_id, "status": "skipped", "reason": "Lead not found"})
            continue
        to_email = (lead.email or "").strip()
        if not to_email or "@" not in to_email:
            skipped += 1
            results.append({
                "lead_id": lead.id,
                "email": to_email or None,
                "status": "skipped",
                "reason": "Lead has no email",
            })
            continue

        tokens = _lead_tokens(lead)
        subject = _apply_outreach_tokens(outreach.subject, tokens, as_html=False)
        body = _apply_outreach_tokens(outreach.body, tokens, as_html=as_html)
        body_html = body if as_html else f"<p>{html_lib.escape(body).replace(chr(10), '<br>')}</p>"
        body_text = body if not as_html else re.sub(r"<[^>]+>", " ", body)

        try:
            send_result = email_service.send_email(
                account_id=account.id,
                to_emails=[to_email],
                subject=subject,
                body_text=body_text,
                body_html=body_html,
            )
        except Exception as exc:
            failed += 1
            logger.error("Outreach send failed for lead %s: %s", lead.id, exc, exc_info=True)
            results.append({
                "lead_id": lead.id,
                "email": to_email,
                "status": "failed",
                "reason": str(exc),
            })
            continue

        if send_result.get("sent"):
            sent += 1
            results.append({
                "lead_id": lead.id,
                "email": to_email,
                "status": "sent",
            })
        else:
            failed += 1
            results.append({
                "lead_id": lead.id,
                "email": to_email,
                "status": "failed",
                "reason": email_service.last_send_error or "Delivery failed",
            })

        if outreach.delay_seconds and index < len(outreach.lead_ids) - 1:
            await asyncio.sleep(outreach.delay_seconds)

    return {
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "total": len(outreach.lead_ids),
        "results": results,
    }


@router.post("/send-template", response_model=schemas.email.SendEmailResponse)
async def send_email_template(
    background_tasks: BackgroundTasks,
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    email_in: schemas.email.SendEmailRequest,
) -> Any:
    """Send email using template"""
    template = crud.email_template.get(db, email_in.template_id)
    if not template:
        raise HTTPException(
            status_code=404,
            detail="Email template not found"
        )

    if template.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to use this template"
        )

    # Replace variables in template
    body = template.body
    if email_in.variables:
        for key, value in email_in.variables.items():
            body = body.replace(f"{{{key}}}", str(value))

    # Create email log
    log = crud.email_log.create(
        db,
        obj_in=schemas.email.EmailLogCreate(
            template_id=template.id,
            to_email=email_in.to_email,
            subject=template.subject,
            body=body,
            status=schemas.email.EmailStatus.PENDING,
            organization_id=current_user.organization_id
        )
    )

    # Send email in background
    background_tasks.add_task(
        send_email_background,
        db=db,
        log_id=log.id,
        to_email=email_in.to_email,
        subject=template.subject,
        body=body
    )

    return {
        "success": True,
        "message": "Email scheduled for sending",
        "log_id": log.id
    }


@router.get("/logs", response_model=EmailLogListResponse)
def list_logs(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    skip: int = 0,
    limit: int = 10,
    status: Optional[EmailStatusSchema] = None,
    to_email: Optional[str] = None,
    template_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Any:
    """
    List email logs with filtering and pagination.
    """
    if not check_permission(db, current_user.id, "view_email_logs"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to view email logs"
        )

    filters = {}
    if status:
        filters["status"] = status
    if to_email:
        filters["to_email"] = to_email
    if template_id:
        filters["template_id"] = template_id
    if start_date:
        filters["start_date"] = start_date
    if end_date:
        filters["end_date"] = end_date

    logs = crud.email_log.get_multi(
        db,
        organization_id=current_user.organization_id,
        skip=skip,
        limit=limit,
        filters=filters
    )

    return {
        "success": True,
        "message": "Email logs retrieved successfully",
        "data": logs
    }


@router.get("/accounts", response_model=List[EmailAccountOut])
def get_email_accounts(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Get all email accounts for the current user"""
    accounts = db.query(EmailAccount).filter(
        EmailAccount.user_id == current_user.id,
        EmailAccount.organization_id == current_user.organization_id
    ).all()
    return accounts


@router.post("/accounts", response_model=EmailAccountOut)
def create_email_account(
    account_in: EmailAccountCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Connect a new email account"""
    email_service = EmailService(db)
    
    try:
        # Convert string provider_type to enum - handle case insensitive
        provider_type_str = account_in.provider_type.lower()
        
        # Map the provider type correctly
        provider_mapping = {
            'gmail': EmailProviderType.GMAIL,
            'outlook': EmailProviderType.OUTLOOK,
            'yahoo': EmailProviderType.YAHOO,
            'custom': EmailProviderType.CUSTOM
        }
        
        if provider_type_str not in provider_mapping:
            raise ValueError(f"Invalid provider type: {account_in.provider_type}. Valid options are: gmail, outlook, yahoo, custom")
            
        provider_type = provider_mapping[provider_type_str]
        
        # Check if account already exists
        existing_account = db.query(EmailAccount).filter(
            EmailAccount.email == account_in.email,
            EmailAccount.organization_id == current_user.organization_id
        ).first()
        
        if existing_account:
            raise HTTPException(
                status_code=409,  # Conflict
                detail={
                    "error": "Email account already exists",
                    "account_id": existing_account.id,
                    "message": "An email account with this address already exists for your organization. Use the update endpoint to modify the existing account.",
                    "existing_account": {
                        "id": existing_account.id,
                        "email": existing_account.email,
                        "provider": existing_account.provider_type,
                        "display_name": existing_account.display_name,
                        "created_at": existing_account.created_at.isoformat() if existing_account.created_at else None
                    }
                }
            )
            
        account = email_service.add_email_account(
            email=account_in.email,
            password=account_in.password,
            display_name=account_in.display_name,
            provider_type=provider_type,
            organization_id=current_user.organization_id,
            user_id=current_user.id,
            custom_settings=account_in.custom_settings
        )
        
        # Start background sync
        background_tasks.add_task(
            email_service.sync_account_emails,
            account.id
        )
        
        return account
        
    except HTTPException:
        # Preserve explicit API responses (e.g. 409 duplicate account).
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating email account: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create email account")


@router.put("/accounts/{account_id}", response_model=EmailAccountOut)
def update_email_account(
    account_id: int,
    account_in: EmailAccountUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Update an existing email account"""
    
    try:
        # Get existing account
        existing_account = db.query(EmailAccount).filter(
            EmailAccount.id == account_id,
            EmailAccount.organization_id == current_user.organization_id
        ).first()
        
        if not existing_account:
            raise HTTPException(status_code=404, detail="Email account not found")
        
        # Create update data
        update_data = {}
        
        # Update basic fields if provided
        if account_in.display_name is not None:
            update_data['display_name'] = account_in.display_name
            
        if account_in.password is not None:
            from app.core.security import encrypt_password
            update_data['password_encrypted'] = encrypt_password(account_in.password)
            
        if account_in.provider_type is not None:
            provider_type_str = account_in.provider_type.lower()
            provider_mapping = {
                'gmail': EmailProviderType.GMAIL.value,
                'outlook': EmailProviderType.OUTLOOK.value,
                'yahoo': EmailProviderType.YAHOO.value,
                'custom': EmailProviderType.CUSTOM.value
            }
            
            if provider_type_str not in provider_mapping:
                raise ValueError(f"Invalid provider type: {account_in.provider_type}")
                
            update_data['provider_type'] = provider_mapping[provider_type_str]
        
        # Update custom settings if provided
        if account_in.custom_settings:
            email_service = EmailService(db)
            current_email = existing_account.email
            current_provider = account_in.provider_type or existing_account.provider_type
            
            imap_settings, smtp_settings = email_service._get_provider_settings(
                email=current_email,
                provider_type=current_provider,
                custom_settings=account_in.custom_settings
            )
            
            update_data.update(imap_settings)
            update_data.update(smtp_settings)
        
        # Update sync settings if provided  
        sync_fields = [
            'sync_enabled', 'sync_frequency_minutes', 'sync_sent_items', 
            'sync_inbox', 'days_to_sync', 'auto_create_contacts', 
            'auto_create_tasks', 'calendar_sync_enabled'
        ]
        
        for field in sync_fields:
            value = getattr(account_in, field, None)
            if value is not None:
                update_data[field] = value
        
        # Apply updates
        for key, value in update_data.items():
            setattr(existing_account, key, value)
        
        # Update timestamp
        existing_account.updated_at = datetime.utcnow()
        
        # Save changes
        db.commit()
        db.refresh(existing_account)
        
        # Start background sync if connection settings changed
        if any(key in update_data for key in ['password_encrypted', 'imap_host', 'smtp_host']):
            background_tasks.add_task(
                EmailService(db).sync_account_emails,
                existing_account.id
            )
        
        return existing_account
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating email account: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update email account")


@router.delete("/accounts/{account_id}")
def delete_email_account(
    account_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Remove an email account"""
    account = db.query(EmailAccount).filter(
        EmailAccount.id == account_id,
        EmailAccount.user_id == current_user.id,
        EmailAccount.organization_id == current_user.organization_id
    ).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="Email account not found")
    
    db.delete(account)
    db.commit()
    
    return {"message": "Email account deleted successfully"}


@router.post("/accounts/{account_id}/sync")
def sync_email_account(
    account_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Start email sync for an account"""
    account = db.query(EmailAccount).filter(
        EmailAccount.id == account_id,
        EmailAccount.user_id == current_user.id,
        EmailAccount.organization_id == current_user.organization_id
    ).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="Email account not found")
    
    email_service = EmailService(db)
    
    # Start background sync
    background_tasks.add_task(
        email_service.sync_account_emails,
        account_id
    )
    
    return {
        "message": f"Email sync initiated for account {account.email}",
        "status": "started"
    }


@router.post("/accounts/{account_id}/sync-calendar")
async def sync_calendar(
    account_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """Sync calendar events from email provider"""
    try:
        # Get email account
        email_account = db.query(EmailAccount).filter(
            EmailAccount.id == account_id,
            EmailAccount.user_id == current_user.id,
            EmailAccount.organization_id == current_user.organization_id
        ).first()
        
        if not email_account:
            raise HTTPException(status_code=404, detail="Email account not found")
        
        if not email_account.calendar_sync_enabled:
            raise HTTPException(status_code=400, detail="Calendar sync is disabled for this account")
        
        # Import here to avoid circular imports
        from app.services.calendar_sync_service import CalendarSyncService
        
        calendar_service = CalendarSyncService(db)
        result = await calendar_service.sync_account_calendar(email_account)
        
        return {
            "message": f"Calendar sync completed for {email_account.email}",
            "result": result
        }
        
    except Exception as e:
        logger.error(f"Calendar sync failed for account {account_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Calendar sync failed: {str(e)}")


@router.post("/accounts/{account_id}/calendar-settings")
async def update_calendar_settings(
    account_id: int,
    settings: dict,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """Update calendar sync settings for an email account"""
    # Get email account
    email_account = db.query(EmailAccount).filter(
        EmailAccount.id == account_id,
        EmailAccount.user_id == current_user.id
    ).first()
    
    if not email_account:
        raise HTTPException(status_code=404, detail="Email account not found")
    
    # Update calendar settings
    if "calendar_sync_enabled" in settings:
        email_account.calendar_sync_enabled = settings["calendar_sync_enabled"]
    
    if "auto_sync_calendar_events" in settings:
        email_account.auto_sync_calendar_events = settings["auto_sync_calendar_events"]
    
    if "calendar_url" in settings:
        email_account.calendar_url = settings["calendar_url"]
    
    db.commit()
    
    return {
        "message": "Calendar settings updated successfully",
        "settings": {
            "calendar_sync_enabled": email_account.calendar_sync_enabled,
            "auto_sync_calendar_events": email_account.auto_sync_calendar_events,
            "calendar_url": email_account.calendar_url
        }
    }


@router.get("/emails", response_model=List[EmailOut])
def get_emails(
    skip: int = 0,
    limit: int = 100,
    account_id: Optional[int] = None,
    unread_only: bool = False,
    direction: Optional[str] = None,  # "incoming", "outgoing", or None for all
    folder: Optional[str] = None,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Get emails for the current user"""
    query = db.query(Email).filter(
        Email.organization_id == current_user.organization_id
    )
    
    if account_id:
        query = query.filter(Email.email_account_id == account_id)

    if folder:
        f = folder.strip().upper()
        if f == "SPAM":
            query = query.filter(Email.folder_name.in_(["SPAM", "JUNK", "[GMAIL]/SPAM"]))
        elif f == "TRASH":
            query = query.filter(Email.folder_name.in_(["TRASH", "BIN", "[GMAIL]/TRASH"]))
        elif f == "DRAFTS":
            query = query.filter(Email.folder_name.in_(["DRAFTS", "DRAFT", "[GMAIL]/DRAFTS"]))
        elif f == "SENT":
            query = query.filter(Email.direction == EmailDirection.outgoing)
        elif f == "INBOX":
            query = query.filter(Email.direction == EmailDirection.incoming).filter(
                (Email.folder_name.is_(None)) | (~Email.folder_name.in_(["SPAM", "JUNK", "[GMAIL]/SPAM", "TRASH", "BIN", "[GMAIL]/TRASH"]))
            )
        else:
            query = query.filter(Email.folder_name == f)
    
    # For sent emails (outgoing), we don't filter by unread status
    # since sent emails are not typically marked as unread
    if direction:
        if direction.lower() == "incoming":
            query = query.filter(Email.direction == EmailDirection.incoming)
            if unread_only:
                query = query.filter(Email.status == EmailStatus.unread)
        elif direction.lower() == "outgoing":
            query = query.filter(Email.direction == EmailDirection.outgoing)
            # Don't apply unread filter for outgoing emails
        else:
            # Invalid direction parameter
            raise HTTPException(status_code=400, detail="Invalid direction. Use 'incoming' or 'outgoing'")
    else:
        # No direction specified, apply unread filter if requested
        if unread_only:
            query = query.filter(Email.status == EmailStatus.unread)
    
    emails = query.order_by(Email.sent_date.desc()).offset(skip).limit(limit).all()
    return emails


@router.get("/emails/{email_id}", response_model=EmailOut)
def get_email(
    email_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Get a specific email"""
    email = db.query(Email).filter(
        Email.id == email_id,
        Email.organization_id == current_user.organization_id
    ).first()
    
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    
    return email


@router.post("/emails/{email_id}/mark-read")
def mark_email_read(
    email_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Mark an email as read"""
    email = db.query(Email).filter(
        Email.id == email_id,
        Email.organization_id == current_user.organization_id
    ).first()
    
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    
    email.status = normalize_email_status(EmailStatus.read, default=EmailStatus.read)
    db.commit()
    
    return {"message": "Email marked as read"}


@router.post("/emails/{email_id}/mark-unread")
def mark_email_unread(
    email_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    email = db.query(Email).filter(
        Email.id == email_id,
        Email.organization_id == current_user.organization_id
    ).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    email.status = normalize_email_status(EmailStatus.unread, default=EmailStatus.unread)
    db.commit()
    return {"message": "Email marked as unread"}


@router.patch("/emails/{email_id}/archive")
def archive_email(
    email_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    email = db.query(Email).filter(
        Email.id == email_id,
        Email.organization_id == current_user.organization_id
    ).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    email.status = normalize_email_status(EmailStatus.archived, default=EmailStatus.archived)
    email.folder_name = "ARCHIVE"
    db.commit()
    return {"message": "Email archived"}


@router.patch("/emails/{email_id}/move")
def move_email_to_folder(
    email_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    email = db.query(Email).filter(
        Email.id == email_id,
        Email.organization_id == current_user.organization_id
    ).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    folder = str(payload.get("folder") or "").strip().upper()
    if not folder:
        raise HTTPException(status_code=400, detail="Folder is required")
    email.folder_name = folder
    if folder in {"INBOX", "SPAM", "JUNK"}:
        email.direction = EmailDirection.incoming
    elif folder in {"SENT", "DRAFTS"}:
        email.direction = EmailDirection.outgoing
    db.commit()
    return {"message": "Email moved", "folder": folder}


@router.get("/emails/{email_id}/suggestions", response_model=List[EmailSuggestion])
def get_email_suggestions(
    email_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Get AI suggestions for calendar events and tasks from email"""
    email = db.query(Email).filter(
        Email.id == email_id,
        Email.organization_id == current_user.organization_id
    ).first()
    
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    
    parser = EmailParser(db)
    suggestions = []
    
    # Get event suggestions
    event_suggestions = parser.parse_email_for_events(email_id)
    for event in event_suggestions:
        suggestions.append(EmailSuggestion(
            type="event",
            title=event['title'],
            description=event['description'],
            confidence_score=event['confidence_score'],
            data=event
        ))
    
    # Get task suggestions
    task_suggestions = parser.parse_email_for_tasks(email_id)
    for task in task_suggestions:
        suggestions.append(EmailSuggestion(
            type="task",
            title=task['title'],
            description=task['description'],
            confidence_score=task['confidence_score'],
            data=task
        ))
    
    return suggestions


@router.post("/emails/{email_id}/create-event")
def create_event_from_email(
    email_id: int,
    event_data: Dict[str, Any],
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Create a calendar event from email suggestion"""
    email = db.query(Email).filter(
        Email.id == email_id,
        Email.organization_id == current_user.organization_id
    ).first()
    
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    
    parser = EmailParser(db)
    event = parser.create_calendar_event_from_email(email_id, event_data)
    
    if event:
        return {"message": "Calendar event created successfully", "event_id": event.id}
    else:
        raise HTTPException(status_code=500, detail="Failed to create calendar event")


@router.post("/emails/{email_id}/create-task")
def create_task_from_email(
    email_id: int,
    task_data: Dict[str, Any],
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    """Create a task from email suggestion"""
    email = db.query(Email).filter(
        Email.id == email_id,
        Email.organization_id == current_user.organization_id
    ).first()
    
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    
    parser = EmailParser(db)
    task = parser.create_task_from_email(email_id, task_data)
    
    if task:
        return {"message": "Task created successfully", "task_id": task.id}
    else:
        raise HTTPException(status_code=500, detail="Failed to create task")
