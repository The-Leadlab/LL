# app/services/email_service.py
import imaplib
import smtplib
import email
from email.utils import parseaddr, parsedate_to_datetime
import re
import socket
import json
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import logging
import base64
from sqlalchemy import and_

from app.models.email_account import EmailAccount, EmailSyncStatus, EmailProviderType
from app.models.email_message import Email, EmailDirection, EmailStatus, normalize_email_status
from app.models.email_attachment import EmailAttachment
from app.core.security import decrypt_password, encrypt_password
from app.core.config import settings
from app.db.session import get_db
from app.services.email_html import wrap_outbound_html

logger = logging.getLogger(__name__)

SMTP_CONNECT_TIMEOUT_SECONDS = 30
SMTP_FALLBACK_TIMEOUT_SECONDS = 20


def _ipv4_create_connection(
    address: Tuple[str, int],
    timeout: Optional[float] = None,
    source_address: Optional[Tuple[str, int]] = None,
) -> socket.socket:
    """
    Like socket.create_connection but only tries IPv4 (AF_INET).
    Avoids Errno 101 (network unreachable) on some cloud hosts when IPv6 is
    resolved first but not routable from the container.
    """
    host, port = address
    last_err: Optional[OSError] = None
    for res in socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM):
        af, socktype, proto, canonname, sa = res
        sock: Optional[socket.socket] = None
        try:
            sock = socket.socket(af, socktype, proto)
            if timeout is not None:
                sock.settimeout(timeout)
            if source_address is not None:
                sock.bind(source_address)
            sock.connect(sa)
            return sock
        except OSError as e:
            last_err = e
            if sock is not None:
                sock.close()
    if last_err is not None:
        raise last_err
    raise OSError(f"IPv4 address not found for {host!r}:{port}")


class _IMAP4_SSL_IPv4(imaplib.IMAP4_SSL):
    def _create_socket(self, timeout):
        sock = _ipv4_create_connection((self.host, self.port), timeout)
        return self.ssl_context.wrap_socket(sock, server_hostname=self.host)


class _IMAP4_IPv4(imaplib.IMAP4):
    def _create_socket(self, timeout):
        return _ipv4_create_connection((self.host, self.port), timeout)


class _SMTP_IPv4(smtplib.SMTP):
    def _get_socket(self, host, port, timeout):
        if timeout is not None and not timeout:
            raise ValueError("Non-blocking socket (timeout=0) is not supported")
        return _ipv4_create_connection((host, port), timeout, self.source_address)


class _SMTP_SSL_IPv4(smtplib.SMTP_SSL):
    def _get_socket(self, host, port, timeout):
        new_socket = _ipv4_create_connection((host, port), timeout, self.source_address)
        return self.context.wrap_socket(new_socket, server_hostname=self._host)


class EmailService:
    """Core service for email operations using IMAP/SMTP"""
    
    def __init__(self, db: Session):
        self.db = db
        self.last_send_error: Optional[str] = None
        self.last_send_error_code: Optional[str] = None
        self.last_send_retryable: bool = False
        self.last_send_status_code: int = 503
        self.last_send_warning: Optional[str] = None

    def _set_send_error(
        self,
        code: str,
        message: str,
        retryable: bool,
        status_code: int = 503,
    ) -> None:
        self.last_send_error_code = code
        self.last_send_error = message
        self.last_send_retryable = retryable
        self.last_send_status_code = status_code

    def _status(self, value: object, default: EmailStatus = EmailStatus.unread) -> EmailStatus:
        return normalize_email_status(value, default=default)
    
    def add_email_account(
        self,
        email: str,
        password: str,
        display_name: str,
        provider_type: EmailProviderType,
        organization_id: int,
        user_id: int,
        custom_settings: Optional[Dict] = None
    ) -> EmailAccount:
        """Add a new email account with auto-detection of settings"""
        
        try:
            # Validate provider_type
            if isinstance(provider_type, str):
                provider_value = provider_type.lower()
            else:
                provider_value = provider_type.value.lower()
                
            # Check if provider_type is valid
            valid_providers = [e.value for e in EmailProviderType]
            if provider_value not in valid_providers:
                raise ValueError(f"Invalid provider type: {provider_value}. Must be one of: {valid_providers}")
            
            # Check if account already exists
            existing_account = self.db.query(EmailAccount).filter(
                and_(
                    EmailAccount.email == email,
                    EmailAccount.organization_id == organization_id
                )
            ).first()
            
            if existing_account:
                raise ValueError("Email account already exists for this organization")
            
            # Auto-detect IMAP/SMTP settings based on provider
            imap_settings, smtp_settings = self._get_provider_settings(
                email=email,
                provider_type=provider_value,
                custom_settings=custom_settings
            )
            
            # For inbox visibility, IMAP must succeed; SMTP issues are non-blocking at connect time.
            if not self._test_connection(email, password, imap_settings, smtp_settings, require_smtp=False):
                raise ValueError("Failed to connect to email server. Please check credentials.")
            
            # Encrypt password
            password_encrypted = encrypt_password(password)
            
            # Create email account
            email_account = EmailAccount(
                email=email,
                display_name=display_name or email,
                provider_type=provider_value,
                password_encrypted=password_encrypted,
                organization_id=organization_id,
                user_id=user_id,
                **imap_settings,
                **smtp_settings,
                # Default sync settings
                sync_status=EmailSyncStatus.ACTIVE,
                sync_enabled=True,
                sync_frequency_minutes=15,
                sync_sent_items=True,
                sync_inbox=True,
                days_to_sync=30,
                auto_create_contacts=True,
                auto_create_tasks=True
            )
            
            # Save to database
            self.db.add(email_account)
            self.db.commit()
            self.db.refresh(email_account)
            
            return email_account
            
        except Exception as e:
            logger.error(f"Error creating email account: {str(e)}")
            raise ValueError(f"Failed to save email account: {str(e)}")
    
    def get_email_accounts(self, organization_id: int, user_id: Optional[int] = None) -> List[EmailAccount]:
        """Get email accounts for an organization, optionally filtered by user"""
        
        query = self.db.query(EmailAccount).filter(EmailAccount.organization_id == organization_id)
        
        if user_id:
            query = query.filter(EmailAccount.user_id == user_id)
        
        return query.all()
    
    def get_email_account_by_id(self, account_id: int, organization_id: int) -> Optional[EmailAccount]:
        """Get a specific email account by ID"""
        
        return self.db.query(EmailAccount).filter(
            and_(
                EmailAccount.id == account_id,
                EmailAccount.organization_id == organization_id
            )
        ).first()
    
    def update_email_account(
        self,
        account_id: int,
        organization_id: int,
        email: Optional[str] = None,
        password: Optional[str] = None,
        display_name: Optional[str] = None,
        provider_type: Optional[str] = None,
        custom_settings: Optional[Dict] = None,
        sync_settings: Optional[Dict] = None
    ) -> Optional[EmailAccount]:
        """Update an existing email account"""
        
        try:
            # Get existing account
            account = self.get_email_account_by_id(account_id, organization_id)
            if not account:
                raise ValueError("Email account not found")
            
            # Update basic info
            if email:
                account.email = email
            if display_name:
                account.display_name = display_name
            if provider_type:
                # Validate provider_type
                if isinstance(provider_type, str):
                    provider_value = provider_type.lower()
                else:
                    provider_value = provider_type.value.lower()
                    
                valid_providers = [e.value for e in EmailProviderType]
                if provider_value not in valid_providers:
                    raise ValueError(f"Invalid provider type: {provider_value}")
                account.provider_type = provider_value
            
            # Update password if provided
            if password:
                account.password_encrypted = encrypt_password(password)
            
            # Update connection settings if provided
            if custom_settings:
                current_email = email or account.email
                current_provider = provider_type or account.provider_type
                
                imap_settings, smtp_settings = self._get_provider_settings(
                    email=current_email,
                    provider_type=current_provider,
                    custom_settings=custom_settings
                )
                
                # Test connection with new settings
                test_password = password or decrypt_password(account.password_encrypted)
                if not self._test_connection(current_email, test_password, imap_settings, smtp_settings):
                    raise ValueError("Failed to connect to email server with new settings")
                
                # Update IMAP settings
                for key, value in imap_settings.items():
                    setattr(account, key, value)
                
                # Update SMTP settings
                for key, value in smtp_settings.items():
                    setattr(account, key, value)
            
            # Update sync settings if provided
            if sync_settings:
                for key, value in sync_settings.items():
                    if hasattr(account, key):
                        setattr(account, key, value)
            
            # Update modified timestamp
            account.updated_at = datetime.utcnow()
            
            # Save changes
            self.db.commit()
            self.db.refresh(account)
            
            return account
            
        except Exception as e:
            logger.error(f"Error updating email account: {str(e)}")
            self.db.rollback()
            raise ValueError(f"Failed to update email account: {str(e)}")
    
    def delete_email_account(self, account_id: int, organization_id: int) -> bool:
        """Delete an email account"""
        
        try:
            account = self.get_email_account_by_id(account_id, organization_id)
            if not account:
                raise ValueError("Email account not found")
            
            self.db.delete(account)
            self.db.commit()
            
            return True
            
        except Exception as e:
            logger.error(f"Error deleting email account: {str(e)}")
            self.db.rollback()
            raise ValueError(f"Failed to delete email account: {str(e)}")
    
    def _get_provider_settings(self, email: str, provider_type: str, custom_settings: Optional[Dict] = None) -> Tuple[Dict, Dict]:
        """Resolve IMAP/SMTP settings from explicit custom config, provider choice, then domain fallback."""
        domain = email.split('@')[1].lower()
        pt = (provider_type.value if hasattr(provider_type, 'value') else str(provider_type)).lower()

        GMAIL_IMAP = {'imap_host': 'imap.gmail.com', 'imap_port': 993, 'imap_use_ssl': True}
        # Prefer SSL 465 for Gmail to avoid STARTTLS/587 egress timeouts on some hosts.
        GMAIL_SMTP = {'smtp_host': 'smtp.gmail.com', 'smtp_port': 465, 'smtp_use_tls': False}
        OUTLOOK_IMAP = {'imap_host': 'outlook.office365.com', 'imap_port': 993, 'imap_use_ssl': True}
        OUTLOOK_SMTP = {'smtp_host': 'smtp.office365.com', 'smtp_port': 587, 'smtp_use_tls': True}
        YAHOO_IMAP = {'imap_host': 'imap.mail.yahoo.com', 'imap_port': 993, 'imap_use_ssl': True}
        YAHOO_SMTP = {'smtp_host': 'smtp.mail.yahoo.com', 'smtp_port': 587, 'smtp_use_tls': True}

        # Explicit IMAP/SMTP (custom provider or UI-provided hosts)
        if custom_settings:
            imap = custom_settings.get('imap') or {}
            smtp = custom_settings.get('smtp') or {}
            if imap.get('imap_host') and smtp.get('smtp_host'):
                return imap, smtp

        # Known providers: use canonical servers for any domain (e.g. Google Workspace @the-leadlab.com)
        if pt == 'gmail':
            return GMAIL_IMAP, GMAIL_SMTP
        if pt == 'outlook':
            return OUTLOOK_IMAP, OUTLOOK_SMTP
        if pt == 'yahoo':
            return YAHOO_IMAP, YAHOO_SMTP
        if pt == 'custom':
            raise ValueError(
                'Custom provider requires IMAP and SMTP hostnames (and ports). '
                'Enter them in the custom server fields.'
            )

        # Domain-only fallback (legacy / unknown provider_type)
        provider_configs = {
            'gmail.com': {'imap': GMAIL_IMAP, 'smtp': GMAIL_SMTP},
            'outlook.com': {'imap': OUTLOOK_IMAP, 'smtp': OUTLOOK_SMTP},
            'yahoo.com': {'imap': YAHOO_IMAP, 'smtp': YAHOO_SMTP},
        }
        if domain in provider_configs:
            config = provider_configs[domain]
            return config['imap'], config['smtp']

        return (
            {'imap_host': f'imap.{domain}', 'imap_port': 993, 'imap_use_ssl': True},
            {'smtp_host': f'smtp.{domain}', 'smtp_port': 465, 'smtp_use_tls': False}
        )
    
    def _test_connection(
        self,
        email: str,
        password: str,
        imap_settings: Dict,
        smtp_settings: Dict,
        require_smtp: bool = True,
    ) -> bool:
        """
        Test IMAP and SMTP with per-connection timeouts only.
        Avoids socket.setdefaulttimeout(), which is process-wide and can interact badly with
        concurrent requests (health checks, avatar, etc.) on the same worker.
        """
        timeout_s = 60
        smtp = None
        try:
            logger.info(f"Testing IMAP connection to {imap_settings['imap_host']}:{imap_settings['imap_port']}")
            try:
                imap = _IMAP4_SSL_IPv4(
                    imap_settings["imap_host"], imap_settings["imap_port"], timeout=timeout_s
                )
            except Exception:
                logger.info("IMAP SSL failed, trying non-SSL connection")
                imap = _IMAP4_IPv4(imap_settings["imap_host"], imap_settings["imap_port"], timeout=timeout_s)

            imap.login(email, password)
            imap.logout()
            logger.info(f"IMAP connection successful for {email}")
        except socket.timeout:
            logger.error(f"IMAP connection timeout for {email} - server may be unreachable")
            return False
        except imaplib.IMAP4.error as e:
            logger.error(f"IMAP authentication failed for {email}: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"IMAP connection test failed for {email}: {str(e)}")
            return False

        logger.info(
            f"Testing SMTP connection to {smtp_settings['smtp_host']}:{smtp_settings['smtp_port']}"
        )
        for attempt in range(2):
            try:
                if smtp_settings.get("smtp_port") == 465:
                    try:
                        smtp = _SMTP_SSL_IPv4(
                            smtp_settings["smtp_host"],
                            smtp_settings["smtp_port"],
                            timeout=timeout_s,
                        )
                        logger.info("SMTP SSL connection successful")
                    except Exception:
                        logger.info("SMTP SSL failed on port 465, trying STARTTLS")
                        smtp = _SMTP_IPv4(smtp_settings["smtp_host"], 587, timeout=timeout_s)
                        smtp.starttls()
                else:
                    smtp = _SMTP_IPv4(
                        smtp_settings["smtp_host"],
                        smtp_settings["smtp_port"],
                        timeout=timeout_s,
                    )
                    if smtp_settings.get("smtp_use_tls", True):
                        smtp.starttls()

                smtp.login(email, password)
                smtp.quit()
                smtp = None
                logger.info(f"SMTP connection successful for {email}")
                return True
            except socket.timeout:
                if smtp is not None:
                    try:
                        smtp.quit()
                    except Exception:
                        pass
                    smtp = None
                if attempt == 0:
                    logger.warning(
                        "SMTP timeout for %s, retrying once (attempt %s/2)",
                        email,
                        attempt + 1,
                    )
                    continue
                msg = (
                    f"SMTP connection timeout for {email} after retry — "
                    "inbox sync remains available; outbound email may be unavailable"
                )
                if require_smtp:
                    logger.error(msg)
                    return False
                logger.warning(msg)
                return True
            except smtplib.SMTPAuthenticationError as e:
                if require_smtp:
                    logger.error(f"SMTP authentication failed for {email}: {str(e)}")
                    return False
                logger.warning(f"SMTP authentication failed for {email}: {str(e)}")
                return True
            except smtplib.SMTPConnectError as e:
                if require_smtp:
                    logger.error(f"SMTP connection failed for {email}: {str(e)}")
                    return False
                logger.warning(f"SMTP connection failed for {email}: {str(e)}")
                return True
            except Exception as e:
                if require_smtp:
                    logger.error(f"SMTP connection test failed for {email}: {str(e)}")
                    return False
                logger.warning(f"SMTP connection test failed for {email}: {str(e)}")
                return True
        return True
    
    def sync_account_emails(self, account_id: int, days_back: int = 30) -> Dict:
        """Sync emails for an account"""
        try:
            # Get account
            account = self.db.query(EmailAccount).filter(EmailAccount.id == account_id).first()
            if not account:
                raise ValueError("Email account not found")

            previous_last_sync = account.last_sync_at
            configured_days = int(account.days_to_sync or days_back or 30)
            effective_days_back = max(int(days_back or 0), configured_days)
            if account.provider_type == EmailProviderType.GMAIL.value and not previous_last_sync:
                # First Gmail sync should import sufficient history.
                effective_days_back = max(effective_days_back, 365)
            
            # Refresh to get current values
            self.db.refresh(account)
            
            # Update sync status
            self.db.query(EmailAccount).filter(EmailAccount.id == account_id).update({
                "sync_status": "syncing",
                "last_sync_at": datetime.utcnow()
            })
            self.db.commit()
            
            # Refresh again to get updated values
            self.db.refresh(account)
            
            # Gmail OAuth path (avoids app-password IMAP failures)
            if account.provider_type == EmailProviderType.GMAIL.value and account.oauth_refresh_token:
                return self._sync_gmail_api_account(account, effective_days_back)

            # Connect to IMAP
            password = decrypt_password(account.password_encrypted)
            imap = _IMAP4_SSL_IPv4(account.imap_host, account.imap_port)
            imap.login(account.email, password)
            
            total_synced = 0
            total_errors = 0
            
            # Sync INBOX
            if account.sync_inbox:
                inbox_synced, inbox_errors = self._sync_folder(imap, account, "INBOX", effective_days_back)
                total_synced += inbox_synced
                total_errors += inbox_errors
            
            # Sync sent items using detected folder aliases.
            if account.sync_sent_items:
                try:
                    sent_folder = self._select_first_existing_folder(
                        imap,
                        ["Sent", "Sent Items", "[Gmail]/Sent Mail", "INBOX.Sent"],
                    )
                    if sent_folder:
                        sent_synced, sent_errors = self._sync_folder(imap, account, sent_folder, effective_days_back)
                        total_synced += sent_synced
                        total_errors += sent_errors
                except Exception as sent_error:
                    logger.error(f"Error syncing Sent folder: {sent_error}")
                    total_errors += 1

            # Sync spam as incoming so Spam tab can match Gmail behavior.
            if account.sync_inbox:
                try:
                    spam_folder = self._select_first_existing_folder(
                        imap,
                        ["Spam", "Junk", "[Gmail]/Spam", "INBOX.Spam"],
                    )
                    if spam_folder:
                        spam_synced, spam_errors = self._sync_folder(imap, account, spam_folder, effective_days_back)
                        total_synced += spam_synced
                        total_errors += spam_errors
                except Exception as spam_error:
                    logger.error(f"Error syncing Spam folder: {spam_error}")
                    total_errors += 1

            # Sync trash so Trash tab matches provider-side folder.
            if account.sync_inbox:
                try:
                    trash_folder = self._select_first_existing_folder(
                        imap,
                        ["Trash", "Bin", "[Gmail]/Trash", "INBOX.Trash"],
                    )
                    if trash_folder:
                        trash_synced, trash_errors = self._sync_folder(imap, account, trash_folder, effective_days_back)
                        total_synced += trash_synced
                        total_errors += trash_errors
                except Exception as trash_error:
                    logger.error(f"Error syncing Trash folder: {trash_error}")
                    total_errors += 1
            
            # Update sync status in database using raw query  
            self.db.query(EmailAccount).filter(EmailAccount.id == account_id).update({
                "sync_status": "active",
                "sync_error_message": None if total_errors == 0 else f"Failed to sync {total_errors} emails",
                "last_sync_at": datetime.utcnow()
            })
            self.db.commit()

            imap.logout()
            
            return {
                "success": True,
                "synced": total_synced,
                "errors": total_errors
            }
            
        except Exception as e:
            logger.error(f"Error syncing emails: {str(e)}")
            
            # Update sync status to error using raw query
            self.db.query(EmailAccount).filter(EmailAccount.id == account_id).update({
                "sync_status": "error",
                "sync_error_message": str(e),
                "last_sync_at": datetime.utcnow()
            })
            self.db.commit()
            
            return {
                "success": False,
                "error": str(e)
            }

    def _get_google_access_token(self, account: EmailAccount) -> str:
        """Return a valid Google access token, refreshing when needed."""
        if (
            account.oauth_access_token
            and account.oauth_token_expires_at
            and account.oauth_token_expires_at > (datetime.utcnow() + timedelta(seconds=60))
        ):
            return account.oauth_access_token

        if not account.oauth_refresh_token:
            raise ValueError("Missing Google refresh token")

        token_resp = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.GOOGLE_CALENDAR_CLIENT_ID,
                "client_secret": settings.GOOGLE_CALENDAR_CLIENT_SECRET,
                "refresh_token": account.oauth_refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=20,
        )
        if token_resp.status_code >= 400:
            raise ValueError(f"Google token refresh failed ({token_resp.status_code})")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("Google token refresh did not return access_token")
        expires_in = int(token_data.get("expires_in") or 3600)
        account.oauth_access_token = access_token
        account.oauth_token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        self.db.add(account)
        self.db.commit()
        return access_token

    def _sync_gmail_api_account(self, account: EmailAccount, days_back: int) -> Dict:
        access_token = self._get_google_access_token(account)
        total_synced = 0
        total_errors = 0
        try:
            if account.sync_inbox:
                synced, errors = self._sync_gmail_label(
                    account=account,
                    access_token=access_token,
                    label_query="in:inbox",
                    days_back=days_back,
                    direction=EmailDirection.incoming,
                    status=self._status(EmailStatus.unread),
                    folder_name="INBOX",
                )
                total_synced += synced
                total_errors += errors
            if account.sync_sent_items:
                synced, errors = self._sync_gmail_label(
                    account=account,
                    access_token=access_token,
                    label_query="in:sent",
                    days_back=days_back,
                    direction=EmailDirection.outgoing,
                    status=self._status(EmailStatus.read, default=EmailStatus.read),
                    folder_name="SENT",
                )
                total_synced += synced
                total_errors += errors
            if account.sync_inbox:
                synced, errors = self._sync_gmail_label(
                    account=account,
                    access_token=access_token,
                    label_query="in:spam",
                    days_back=days_back,
                    direction=EmailDirection.incoming,
                    status=self._status(EmailStatus.unread),
                    folder_name="SPAM",
                )
                total_synced += synced
                total_errors += errors
            if account.sync_inbox:
                synced, errors = self._sync_gmail_label(
                    account=account,
                    access_token=access_token,
                    label_query="in:trash",
                    days_back=days_back,
                    direction=EmailDirection.incoming,
                    status=self._status(EmailStatus.read, default=EmailStatus.read),
                    folder_name="TRASH",
                )
                total_synced += synced
                total_errors += errors

            self.db.query(EmailAccount).filter(EmailAccount.id == account.id).update({
                "sync_status": "active",
                "sync_error_message": None if total_errors == 0 else f"Failed to sync {total_errors} emails",
                "last_sync_at": datetime.utcnow(),
            })
            self.db.commit()
            return {"success": True, "synced": total_synced, "errors": total_errors}
        except Exception as e:
            self.db.query(EmailAccount).filter(EmailAccount.id == account.id).update({
                "sync_status": "error",
                "sync_error_message": str(e),
                "last_sync_at": datetime.utcnow(),
            })
            self.db.commit()
            return {"success": False, "error": str(e)}

    def _sync_gmail_label(
        self,
        *,
        account: EmailAccount,
        access_token: str,
        label_query: str,
        days_back: int,
        direction: EmailDirection,
        status: EmailStatus,
        folder_name: Optional[str] = None,
    ) -> Tuple[int, int]:
        headers = {"Authorization": f"Bearer {access_token}"}
        query = label_query if days_back <= 0 else f"{label_query} newer_than:{days_back}d"
        synced_count = 0
        error_count = 0
        page_token: Optional[str] = None
        pages = 0

        while True:
            params: Dict[str, Any] = {"maxResults": 100, "q": query}
            if page_token:
                params["pageToken"] = page_token
            list_resp = requests.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                headers=headers,
                params=params,
                timeout=30,
            )
            if list_resp.status_code >= 400:
                raise ValueError(f"Gmail list failed ({list_resp.status_code})")
            data = list_resp.json()
            messages = data.get("messages", []) or []
            pages += 1

            for item in messages:
                msg_id = item.get("id")
                if not msg_id:
                    continue
                try:
                    detail_resp = requests.get(
                        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}",
                        headers=headers,
                        params={"format": "metadata", "metadataHeaders": ["Subject", "From", "To", "Date", "Message-ID"]},
                        timeout=30,
                    )
                    if detail_resp.status_code >= 400:
                        error_count += 1
                        continue
                    payload = detail_resp.json()
                    header_map = {}
                    for h in (payload.get("payload", {}).get("headers", []) or []):
                        name = (h.get("name") or "").strip().lower()
                        if name:
                            header_map[name] = h.get("value") or ""

                    message_id = header_map.get("message-id") or payload.get("id")
                    existing = self.db.query(Email).filter(
                        Email.message_id == message_id,
                        Email.email_account_id == account.id,
                    ).first()
                    if existing:
                        continue

                    from_name, from_email = parseaddr(header_map.get("from", ""))
                    to_raw = header_map.get("to", "")
                    to_list = [addr.strip() for addr in re.split(r"[;,]", to_raw) if addr.strip()]
                    internal_ms = payload.get("internalDate")
                    sent_date = datetime.utcnow()
                    if internal_ms:
                        try:
                            sent_date = datetime.utcfromtimestamp(int(internal_ms) / 1000.0)
                        except Exception:
                            pass
                    else:
                        date_header = header_map.get("date")
                        if date_header:
                            try:
                                sent_date = parsedate_to_datetime(date_header).replace(tzinfo=None)
                            except Exception:
                                pass

                    db_email = Email(
                        email_account_id=account.id,
                        organization_id=account.organization_id,
                        message_id=message_id,
                        thread_id=payload.get("threadId"),
                        subject=header_map.get("subject") or "(No Subject)",
                        from_email=from_email or account.email,
                        from_name=from_name or from_email or account.display_name,
                        to_emails=json.dumps(to_list),
                        cc_emails=json.dumps([]),
                        bcc_emails=json.dumps([]),
                        body_text=payload.get("snippet") or "",
                        body_html=None,
                        sent_date=sent_date,
                        received_date=sent_date,
                        direction=direction,
                        status=self._status(status),
                        folder_name=folder_name or ("INBOX" if direction == EmailDirection.incoming else "SENT"),
                        has_attachments=False,
                    )
                    self.db.add(db_email)
                    self.db.commit()
                    synced_count += 1
                except Exception:
                    self.db.rollback()
                    error_count += 1

            page_token = data.get("nextPageToken")
            if not page_token:
                break

        logger.info(
            "Gmail sync label=%s account=%s pages=%s synced=%s errors=%s",
            label_query,
            account.id,
            pages,
            synced_count,
            error_count,
        )
        return synced_count, error_count

    def _select_first_existing_folder(self, imap: imaplib.IMAP4, candidates: List[str]) -> Optional[str]:
        for folder in candidates:
            try:
                typ, _ = imap.select(folder, readonly=True)
                if typ == "OK":
                    return folder
            except Exception:
                continue
        return None
    
    def _sync_folder(self, imap: imaplib.IMAP4, account: EmailAccount, folder: str, days_back: int) -> Tuple[int, int]:
        """Sync emails from a specific folder"""
        try:
            # Try to select the folder
            imap.select(folder)
            
            # Search for recent emails
            since_date = (datetime.now() - timedelta(days=days_back)).strftime("%d-%b-%Y")
            typ, data = imap.search(None, f'SINCE {since_date}')
            
            if typ != 'OK':
                logger.error(f"Failed to search folder {folder}")
                return 0, 0
            
            email_ids = data[0].split()
            synced_count = 0
            error_count = 0
            
            # Process emails in batches to avoid memory issues
            batch_size = 50
            for i in range(0, len(email_ids), batch_size):
                batch = email_ids[i:i + batch_size]
                
                # First get message IDs for all emails in batch
                for email_id in batch:
                    try:
                        # Get Message-ID header
                        typ, msg_data = imap.fetch(email_id, '(BODY[HEADER.FIELDS (MESSAGE-ID)])')
                        if typ != 'OK':
                            error_count += 1
                            continue
                            
                        message_id = email.message_from_bytes(msg_data[0][1]).get('Message-ID')
                        if not message_id:
                            error_count += 1
                            continue
                            
                        # Check if email already exists
                        existing_email = self.db.query(Email).filter(
                            Email.message_id == message_id,
                            Email.email_account_id == account.id
                        ).first()
                        
                        # Skip if email already exists
                        if existing_email:
                            logger.debug(f"Skipping existing email with Message-ID: {message_id}")
                            continue
                            
                        # If email doesn't exist, fetch full message
                        if self._sync_single_email(imap, account, email_id, folder):
                            synced_count += 1
                        else:
                            error_count += 1
                            
                    except Exception as e:
                        logger.error(f"Error processing email {email_id}: {str(e)}")
                        error_count += 1
                        continue
            
            return synced_count, error_count
            
        except Exception as e:
            logger.error(f"Error syncing folder {folder}: {str(e)}")
            return 0, 0
    
    def _sync_single_email(self, imap: imaplib.IMAP4, account: EmailAccount, email_id: bytes, folder: str) -> bool:
        """Sync a single email"""
        try:
            # Fetch the full email
            typ, msg_data = imap.fetch(email_id, '(RFC822)')
            if typ != 'OK':
                logger.error(f"Failed to fetch email {email_id}")
                return False
            
            email_body = msg_data[0][1]
            email_message = email.message_from_bytes(email_body)
            
            # Parse email data
            parsed_data = self._parse_email(email_message, account, folder)
            if not parsed_data:
                return False
            
            # Create email record
            db_email = Email(
                email_account_id=account.id,
                organization_id=account.organization_id,
                message_id=parsed_data['message_id'],
                subject=parsed_data['subject'],
                from_email=parsed_data['from_email'],
                from_name=parsed_data['from_name'],
                to_emails=json.dumps(parsed_data['to_emails']) if parsed_data['to_emails'] else json.dumps([]),
                cc_emails=json.dumps(parsed_data.get('cc_emails', [])),
                bcc_emails=json.dumps(parsed_data.get('bcc_emails', [])),
                reply_to=parsed_data.get('reply_to'),
                body_text=parsed_data.get('body_text'),
                body_html=parsed_data.get('body_html'),
                sent_date=parsed_data['sent_date'],
                direction=EmailDirection.incoming if folder.upper() in {'INBOX', 'SPAM', 'JUNK', '[GMAIL]/SPAM'} else EmailDirection.outgoing,
                status=self._status(EmailStatus.unread if folder.upper() in {'INBOX', 'SPAM', 'JUNK', '[GMAIL]/SPAM'} else EmailStatus.read),
                folder_name=folder.upper(),
            )
            
            self.db.add(db_email)
            self.db.commit()
            
            # Process attachments if any
            if parsed_data.get('has_attachments'):
                self._process_attachments(email_message, db_email)
            
            # Analyze content for smart features
            self._analyze_email_content(db_email)
            
            return True
            
        except Exception as e:
            logger.error(f"Error syncing single email: {str(e)}")
            self.db.rollback()
            return False
    
    def _decode_email_subject(self, subject: str) -> str:
        """Decode base64 encoded email subject"""
        try:
            # Check for base64 encoded parts
            if '=?utf-8?B?' in subject:
                # Extract and decode each base64 part
                parts = []
                current_pos = 0
                while True:
                    start = subject.find('=?utf-8?B?', current_pos)
                    if start == -1:
                        # Add remaining text
                        if current_pos < len(subject):
                            parts.append(subject[current_pos:])
                        break
                    
                    # Add text before encoded part
                    if start > current_pos:
                        parts.append(subject[current_pos:start])
                    
                    # Find end of encoded part
                    end = subject.find('?=', start)
                    if end == -1:
                        # No end marker found, treat rest as plain text
                        parts.append(subject[current_pos:])
                        break
                    
                    # Extract base64 part
                    encoded = subject[start + 10:end]  # Skip =?utf-8?B?
                    try:
                        # Decode base64 to bytes then to UTF-8
                        decoded = base64.b64decode(encoded).decode('utf-8')
                        parts.append(decoded)
                    except:
                        # If decoding fails, keep original text
                        parts.append(subject[start:end + 2])
                    
                    current_pos = end + 2
                
                return ''.join(parts)
        except Exception as e:
            logger.error(f"Error decoding email subject: {str(e)}")
        
        return subject
    
    def _parse_email(self, msg: email.message.Message, account: EmailAccount, folder: str) -> Optional[Dict]:
        """Parse email message and extract relevant data"""
        try:
            # Get message ID
            message_id = msg.get('Message-ID', '').strip('<>')
            if not message_id:
                return None
            
            # Get subject and decode if needed
            subject = msg.get('Subject', '')
            if isinstance(subject, email.header.Header):
                subject = str(subject)
            subject = self._decode_email_subject(subject)
            
            # Get sender info
            from_header = msg.get('From', '')
            from_email = self._extract_email_from_header(from_header)
            from_name = self._extract_name_from_email(from_header)
            
            if not from_email:
                return None
            
            # Get recipient info
            to_header = msg.get('To', '')
            to_emails = self._parse_email_list(to_header)
            
            cc_header = msg.get('Cc', '')
            cc_emails = self._parse_email_list(cc_header) if cc_header else []
            
            bcc_header = msg.get('Bcc', '')
            bcc_emails = self._parse_email_list(bcc_header) if bcc_header else []
            
            # Get reply-to
            reply_to = msg.get('Reply-To', '')
            if reply_to:
                reply_to = self._extract_email_from_header(reply_to)
            
            # Get sent date
            date_str = msg.get('Date', '')
            try:
                sent_date = email.utils.parsedate_to_datetime(date_str)
            except:
                sent_date = datetime.utcnow()
            
            # Get email body
            body_text, body_html = self._extract_email_body(msg)
            
            # Check for attachments
            has_attachments = False
            for part in msg.walk():
                if part.get_content_maintype() == 'multipart':
                    continue
                if part.get('Content-Disposition') is None:
                    continue
                has_attachments = True
                break
            
            return {
                'message_id': message_id,
                'subject': subject or '(No Subject)',
                'from_email': from_email,
                'from_name': from_name,
                'to_emails': to_emails,
                'cc_emails': cc_emails,
                'bcc_emails': bcc_emails,
                'reply_to': reply_to,
                'body_text': body_text,
                'body_html': body_html,
                'sent_date': sent_date,
                'has_attachments': has_attachments
            }
            
        except Exception as e:
            logger.error(f"Error parsing email: {str(e)}")
            return None
    
    def _extract_email_body(self, msg: email.message.Message) -> Tuple[Optional[str], Optional[str]]:
        """Extract text and HTML body from email"""
        body_text = None
        body_html = None
        
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition"))
                
                if "attachment" not in content_disposition:
                    if content_type == "text/plain":
                        body_text = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                    elif content_type == "text/html":
                        body_html = part.get_payload(decode=True).decode('utf-8', errors='ignore')
        else:
            content_type = msg.get_content_type()
            if content_type == "text/plain":
                body_text = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
            elif content_type == "text/html":
                body_html = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
        
        return body_text, body_html
    
    def _parse_email_list(self, email_header: str) -> List[str]:
        """Parse comma-separated email list"""
        if not email_header:
            return []
        
        emails = []
        for addr in email_header.split(','):
            email_addr = self._extract_email_from_header(addr.strip())
            if email_addr:
                emails.append(email_addr)
        
        return emails
    
    def _extract_email_from_header(self, header: str) -> Optional[str]:
        """Extract email address from email header"""
        if not header:
            return None
        
        # Use regex to find email pattern
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        match = re.search(email_pattern, header)
        return match.group(0) if match else None
    
    def _extract_name_from_email(self, header: str) -> Optional[str]:
        """Extract display name from email header"""
        if not header:
            return None
        
        # Extract name before email
        if '<' in header:
            name = header.split('<')[0].strip().strip('"')
            return name if name else None
        
        return None
    
    def _process_attachments(self, msg: email.message.Message, db_email: Email):
        """Process and save email attachments"""
        for part in msg.walk():
            content_disposition = str(part.get("Content-Disposition"))
            
            if "attachment" in content_disposition:
                filename = part.get_filename()
                if filename:
                    content_type = part.get_content_type()
                    content = part.get_payload(decode=True)
                    
                    attachment = EmailAttachment(
                        filename=filename,
                        content_type=content_type,
                        size_bytes=len(content) if content else 0,
                        content=content if len(content) < 1024*1024 else None,  # Store only if < 1MB
                        is_inline=False,
                        is_calendar_invite=filename.lower().endswith('.ics'),
                        email_id=db_email.id
                    )
                    
                    self.db.add(attachment)
        
        self.db.commit()
    
    def _analyze_email_content(self, db_email: Email):
        """Analyze email content for meetings, tasks, etc."""
        content = (db_email.body_text or '') + ' ' + (db_email.body_html or '')
        
        # Prepare update data
        update_data = {}
        
        # Check for meeting-related keywords
        meeting_keywords = ['meeting', 'call', 'appointment', 'schedule', 'toplantı', 'randevu', 'görüşme']
        contains_meeting = any(keyword in content.lower() for keyword in meeting_keywords)
        
        if contains_meeting:
            update_data['contains_meeting_info'] = True
            
            # Extract dates (basic regex patterns)
            date_patterns = [
                r'\d{1,2}/\d{1,2}/\d{4}',  # MM/DD/YYYY
                r'\d{1,2}-\d{1,2}-\d{4}',  # MM-DD-YYYY
                r'\d{4}-\d{1,2}-\d{1,2}',  # YYYY-MM-DD
            ]
            
            extracted_dates = []
            for pattern in date_patterns:
                matches = re.findall(pattern, content)
                extracted_dates.extend(matches)
            
            if extracted_dates:
                update_data['extracted_dates'] = json.dumps(extracted_dates)
        
        # Extract action items (basic implementation)
        action_keywords = ['todo', 'action', 'follow up', 'call', 'email', 'send', 'review']
        action_items = []
        
        sentences = content.split('.')
        for sentence in sentences:
            if any(keyword in sentence.lower() for keyword in action_keywords):
                action_items.append(sentence.strip())
        
        if action_items:
            update_data['action_items'] = json.dumps(action_items[:5])  # Limit to 5 action items
        
        # Update using raw query if there's data to update
        if update_data:
            self.db.query(Email).filter(Email.id == db_email.id).update(update_data)
            self.db.commit()
    
    def send_email(
        self,
        account_id: int,
        to_emails: List[str],
        subject: str,
        body_text: Optional[str] = None,
        body_html: Optional[str] = None,
        cc_emails: Optional[List[str]] = None,
        bcc_emails: Optional[List[str]] = None,
        reply_to: Optional[str] = None,
        lead_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Send email via SMTP, API provider, or auto fallback."""
        self.last_send_error = None
        self.last_send_error_code = None
        self.last_send_retryable = False
        self.last_send_status_code = 503
        self.last_send_warning = None

        account = self.db.query(EmailAccount).filter(EmailAccount.id == account_id).first()
        if not account:
            raise ValueError("Email account not found")

        try:
            # Campaigns from a connected Google mailbox must send as that user,
            # never via the shared no-reply/Resend address.
            use_gmail_api = self._is_google_oauth_mailbox(account)
            if use_gmail_api and not reply_to:
                reply_to = account.email

            if body_html:
                body_html = wrap_outbound_html(body_html)

            msg = self._build_message(
                account=account,
                to_emails=to_emails,
                cc_emails=cc_emails,
                subject=subject,
                reply_to=reply_to,
                body_text=body_text,
                body_html=body_html,
            )

            provider_mode = getattr(settings, "EMAIL_PROVIDER", "auto").lower().strip()
            if provider_mode not in {"smtp", "api", "auto"}:
                provider_mode = "auto"

            can_use_api = self._api_from_matches_account(account)
            resend_from = self._resend_from_address()
            transport_used = ""
            actual_from_email = account.email
            sent = False
            if use_gmail_api:
                sent = self._send_email_gmail_api(account, msg, to_emails, cc_emails, bcc_emails)
                transport_used = "gmail_api"
            elif provider_mode == "api" and can_use_api:
                sent = self._send_email_provider_api(account, to_emails, cc_emails, bcc_emails, subject, body_text, body_html)
                transport_used = "api"
                actual_from_email = resend_from or account.email
            else:
                # Mailbox SMTP first. Resend/API is only allowed when From would
                # stay the linked account — never rewrite to no-reply@.
                sent = self._send_email_smtp(account, msg, to_emails, cc_emails, bcc_emails)
                transport_used = "smtp"
                if not sent and provider_mode != "smtp" and can_use_api:
                    logger.warning("SMTP delivery failed for account %s, trying provider API fallback", account.id)
                    sent = self._send_email_provider_api(account, to_emails, cc_emails, bcc_emails, subject, body_text, body_html)
                    if sent:
                        transport_used = "api"
                        actual_from_email = resend_from or account.email
                elif not sent and not can_use_api:
                    smtp_error = self.last_send_error
                    smtp_error_code = self.last_send_error_code
                    self._set_send_error(
                        code=smtp_error_code or "SMTP_SEND_FAILED",
                        message=(
                            f"SMTP delivery failed for {account.email} and API fallback "
                            f"is blocked because it would rewrite the sender to "
                            f"{resend_from}. "
                            f"Original SMTP error: {smtp_error}"
                        ),
                        retryable=self.last_send_retryable,
                        status_code=self.last_send_status_code,
                    )
                    logger.warning(
                        "SMTP failed for mailbox %s (%s); API fallback blocked to prevent From rewrite",
                        account.id,
                        account.email,
                    )

            if not sent:
                return {"sent": False, "persisted": False, "transport": transport_used}

            persisted = True
            warning: Optional[str] = None
            try:
                self._persist_sent_email(
                    account=account,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                    to_emails=to_emails,
                    cc_emails=cc_emails,
                    bcc_emails=bcc_emails,
                    message_id=msg.get("Message-ID"),
                    lead_id=lead_id,
                    actual_from_email=actual_from_email,
                    transport=transport_used,
                )
            except Exception as persist_err:
                self.db.rollback()
                persisted = False
                warning = "Email was sent, but saving it locally failed. Please refresh or run sync."
                self.last_send_warning = warning
                logger.error(
                    "Email delivered but persistence failed for account %s: %s",
                    account.id,
                    str(persist_err),
                    exc_info=True,
                )
            logger.info("Email delivered successfully via %s transport for account %s", transport_used, account.id)
            return {"sent": True, "persisted": persisted, "transport": transport_used, "warning": warning}

        except Exception as e:
            self._set_send_error(
                code="DELIVERY_FAILED",
                message=f"{type(e).__name__}: {str(e)}",
                retryable=False,
                status_code=503,
            )
            logger.error("Failed to send email for %s: %s: %s", account.email, type(e).__name__, str(e))
            return {"sent": False, "persisted": False, "transport": None}

    def _build_message(
        self,
        account: EmailAccount,
        to_emails: List[str],
        cc_emails: Optional[List[str]],
        subject: str,
        reply_to: Optional[str],
        body_text: Optional[str],
        body_html: Optional[str],
    ) -> MIMEMultipart:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{account.display_name} <{account.email}>" if account.display_name else account.email
        msg['To'] = ', '.join(to_emails)
        if cc_emails:
            msg['Cc'] = ', '.join(cc_emails)
        if reply_to:
            msg['Reply-To'] = reply_to
        if body_text:
            msg.attach(MIMEText(body_text, 'plain', 'utf-8'))
        if body_html:
            msg.attach(MIMEText(body_html, 'html', 'utf-8'))
        return msg

    def _is_google_oauth_mailbox(self, account: EmailAccount) -> bool:
        if (getattr(account, "auth_type", None) or "").lower() != "oauth":
            return False
        if not getattr(account, "oauth_refresh_token", None):
            return False
        provider = str(getattr(account, "provider_type", None) or "").lower()
        return provider in {EmailProviderType.GMAIL.value, "gmail", "google"}

    def _is_custom_smtp_account(self, account: EmailAccount) -> bool:
        """True when the account uses its own SMTP server (not Google OAuth)."""
        if self._is_google_oauth_mailbox(account):
            return False
        provider = str(getattr(account, "provider_type", None) or "").lower()
        return provider not in {EmailProviderType.GMAIL.value, "gmail", "google"}

    def _api_from_matches_account(self, account: EmailAccount) -> bool:
        """True when the Resend/API from-address equals the account's email.

        If the domains don't match we'd silently rewrite the sender identity,
        so the API path must not be used as a fallback.
        """
        resend_from = self._resend_from_address().lower()
        account_email = (account.email or "").strip().lower()
        return bool(resend_from and account_email and resend_from == account_email)

    def _resend_from_address(self) -> str:
        return (
            getattr(settings, "RESEND_FROM_EMAIL", None)
            or getattr(settings, "EMAILS_FROM_EMAIL", None)
            or ""
        ).strip()

    def _send_email_gmail_api(
        self,
        account: EmailAccount,
        msg: MIMEMultipart,
        to_emails: List[str],
        cc_emails: Optional[List[str]],
        bcc_emails: Optional[List[str]],
    ) -> bool:
        try:
            access_token = self._get_google_access_token(account)
        except ValueError as exc:
            self._set_send_error(
                code="GMAIL_OAUTH_REQUIRED",
                message=(
                    f"Could not send as {account.email}. Reconnect Google under Settings → Integrations "
                    f"so campaigns go out from your mailbox. ({exc})"
                ),
                retryable=False,
                status_code=400,
            )
            return False

        if bcc_emails and not msg.get("Bcc"):
            msg["Bcc"] = ", ".join(bcc_emails)

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        try:
            response = requests.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={"raw": raw},
                timeout=30,
            )
        except requests.RequestException as exc:
            self._set_send_error(
                code="GMAIL_API_UNAVAILABLE",
                message=f"Gmail send request failed: {exc}",
                retryable=True,
                status_code=503,
            )
            return False

        if 200 <= response.status_code < 300:
            return True

        body_text_resp = (response.text or "")[:500]
        if response.status_code in {401, 403}:
            self._set_send_error(
                code="GMAIL_SEND_DENIED",
                message=(
                    f"Google refused to send as {account.email}. Click Connect Google / Gmail once "
                    f"to grant send permission, then try again. ({response.status_code}) {body_text_resp}"
                ),
                retryable=False,
                status_code=400,
            )
            return False

        self._set_send_error(
            code="GMAIL_SEND_FAILED",
            message=f"Gmail send failed ({response.status_code}): {body_text_resp}",
            retryable=response.status_code >= 500,
            status_code=503 if response.status_code >= 500 else 400,
        )
        return False

    def _try_smtp_send(
        self,
        host: str,
        port: int,
        use_ssl: bool,
        use_starttls: bool,
        password: str,
        email_addr: str,
        msg: MIMEMultipart,
        recipients: List[str],
        timeout: float,
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Try a single SMTP connect+login+send.

        Returns ``(success, error_type, error_message)`` where
        *error_type* is one of ``"timeout"``, ``"auth"``, or ``"other"``.
        """
        smtp = None
        try:
            if use_ssl:
                smtp = _SMTP_SSL_IPv4(host, port, timeout=timeout)
            else:
                smtp = _SMTP_IPv4(host, port, timeout=timeout)
                if use_starttls:
                    smtp.ehlo()
                    smtp.starttls()
                    smtp.ehlo()

            smtp.login(email_addr, password)
            smtp.send_message(msg, to_addrs=recipients)
            return True, None, None
        except (TimeoutError, socket.timeout, OSError) as e:
            if isinstance(e, OSError) and not isinstance(e, (TimeoutError, socket.timeout)):
                if "timed out" not in str(e).lower():
                    return False, "other", f"{type(e).__name__}: {e}"
            return False, "timeout", str(e)
        except smtplib.SMTPAuthenticationError as e:
            return False, "auth", str(e)
        except Exception as e:
            return False, "other", f"{type(e).__name__}: {e}"
        finally:
            if smtp is not None:
                try:
                    smtp.quit()
                except Exception:
                    pass

    def _send_email_smtp(
        self,
        account: EmailAccount,
        msg: MIMEMultipart,
        to_emails: List[str],
        cc_emails: Optional[List[str]],
        bcc_emails: Optional[List[str]],
    ) -> bool:
        """Send via the account's SMTP server with port-fallback and retry on timeout.

        Attempt sequence:
          1. Configured port (465 SSL **or** 587 STARTTLS)
          2. Alternate port on timeout/connection failure (587↔465)
          3. Configured port one more time (final retry)

        Authentication errors abort immediately; all other failures advance
        to the next attempt.
        """
        password = decrypt_password(account.password_encrypted)
        all_recipients = to_emails + (cc_emails or []) + (bcc_emails or [])
        host = account.smtp_host
        configured_port = account.smtp_port or 587
        alt_port = 587 if configured_port == 465 else 465

        attempts: List[Tuple[str, int, float]] = [
            ("primary", configured_port, SMTP_CONNECT_TIMEOUT_SECONDS),
            ("alt", alt_port, SMTP_FALLBACK_TIMEOUT_SECONDS),
            ("retry", configured_port, SMTP_CONNECT_TIMEOUT_SECONDS),
        ]

        last_err_type: Optional[str] = None
        last_err_msg: Optional[str] = None

        for label, port, timeout in attempts:
            use_ssl = port == 465
            use_starttls = not use_ssl and (account.smtp_use_tls or port == 587)

            ok, err_type, err_msg = self._try_smtp_send(
                host, port, use_ssl, use_starttls,
                password, account.email, msg, all_recipients, timeout,
            )

            if ok:
                if label != "primary":
                    logger.info(
                        "SMTP send succeeded on %s attempt (port %d) for %s",
                        label, port, account.email,
                    )
                return True

            last_err_type = err_type
            last_err_msg = err_msg

            if err_type == "auth":
                self._set_send_error(
                    code="SMTP_AUTH_FAILED",
                    message=f"SMTP authentication failed: {err_msg}",
                    retryable=False,
                    status_code=503,
                )
                return False

            logger.warning(
                "SMTP %s on %s port %d for %s (attempt %s/%d)",
                err_type, label, port, account.email,
                label, len(attempts),
            )

        if last_err_type == "timeout":
            self._set_send_error(
                code="SMTP_TIMEOUT",
                message=(
                    f"SMTP timeout after {len(attempts)} attempts "
                    f"(ports {configured_port}/{alt_port})"
                ),
                retryable=True,
                status_code=503,
            )
        else:
            self._set_send_error(
                code="SMTP_SEND_FAILED",
                message=f"SMTP send failed: {last_err_msg}",
                retryable=True,
                status_code=503,
            )
        return False

    def _send_email_provider_api(
        self,
        account: EmailAccount,
        to_emails: List[str],
        cc_emails: Optional[List[str]],
        bcc_emails: Optional[List[str]],
        subject: str,
        body_text: Optional[str],
        body_html: Optional[str],
    ) -> bool:
        resend_api_key = getattr(settings, "RESEND_API_KEY", None)
        if not resend_api_key:
            self._set_send_error(
                code="PROVIDER_NOT_CONFIGURED",
                message="RESEND_API_KEY is not configured",
                retryable=False,
                status_code=503,
            )
            return False

        from_email = getattr(settings, "RESEND_FROM_EMAIL", None) or settings.EMAILS_FROM_EMAIL or account.email
        from_name = getattr(settings, "SMTP_FROM_NAME", "LeadLab")
        timeout_seconds = int(getattr(settings, "EMAIL_PROVIDER_TIMEOUT_SECONDS", 12))

        payload: Dict[str, object] = {
            "from": f"{from_name} <{from_email}>",
            "to": to_emails,
            "subject": subject,
            "text": body_text or (body_html or ""),
            "html": body_html or None,
        }
        if cc_emails:
            payload["cc"] = cc_emails
        if bcc_emails:
            payload["bcc"] = bcc_emails

        headers = {
            "Authorization": f"Bearer {resend_api_key}",
            "Content-Type": "application/json",
        }

        last_error: Optional[str] = None
        for attempt in range(2):
            try:
                response = requests.post(
                    "https://api.resend.com/emails",
                    headers=headers,
                    json=payload,
                    timeout=(timeout_seconds, timeout_seconds),
                )

                if 200 <= response.status_code < 300:
                    return True

                body_text_resp = response.text[:500]
                if response.status_code in (401, 403):
                    self._set_send_error(
                        code="PROVIDER_AUTH_FAILED",
                        message=f"Provider authentication failed ({response.status_code})",
                        retryable=False,
                        status_code=503,
                    )
                    return False
                if response.status_code in (400, 422):
                    self._set_send_error(
                        code="PROVIDER_REJECTED",
                        message=f"Provider rejected email payload ({response.status_code}): {body_text_resp}",
                        retryable=False,
                        status_code=400,
                    )
                    return False
                if response.status_code >= 500:
                    last_error = f"Provider temporary error ({response.status_code}): {body_text_resp}"
                    continue

                self._set_send_error(
                    code="PROVIDER_ERROR",
                    message=f"Provider error ({response.status_code}): {body_text_resp}",
                    retryable=False,
                    status_code=503,
                )
                return False
            except requests.Timeout as e:
                last_error = f"Provider timeout: {str(e)}"
            except requests.RequestException as e:
                last_error = f"Provider request failed: {str(e)}"

        self._set_send_error(
            code="PROVIDER_UNAVAILABLE",
            message=last_error or "Provider unavailable",
            retryable=True,
            status_code=503,
        )
        return False

    def _persist_sent_email(
        self,
        account: EmailAccount,
        subject: str,
        body_text: Optional[str],
        body_html: Optional[str],
        to_emails: List[str],
        cc_emails: Optional[List[str]],
        bcc_emails: Optional[List[str]],
        message_id: Optional[str],
        lead_id: Optional[int] = None,
        actual_from_email: Optional[str] = None,
        transport: Optional[str] = None,
    ) -> None:
        from_email = actual_from_email or account.email
        from_name = account.display_name
        if transport == "api" and from_email != account.email:
            from_name = getattr(settings, "SMTP_FROM_NAME", "LeadLab")

        sent_email = Email(
            message_id=message_id or f"sent-{datetime.utcnow().timestamp()}",
            subject=subject,
            from_email=from_email,
            from_name=from_name,
            to_emails=json.dumps(to_emails) if to_emails else json.dumps([]),
            cc_emails=json.dumps(cc_emails) if cc_emails else json.dumps([]),
            bcc_emails=json.dumps(bcc_emails) if bcc_emails else json.dumps([]),
            body_text=body_text,
            body_html=body_html,
            direction=EmailDirection.outgoing,
            status=self._status(EmailStatus.read, default=EmailStatus.read),
            sent_date=datetime.utcnow(),
            received_date=datetime.utcnow(),
            folder_name='SENT',
            email_account_id=account.id,
            organization_id=account.organization_id,
            lead_id=lead_id,
        )
        self.db.add(sent_email)
        self.db.commit()