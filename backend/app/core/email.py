import smtplib
import ssl
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
from app.core.config import settings
import httpx
import asyncio
from email.mime.base import MIMEBase
from email import encoders
import aiosmtplib
from app.services.system_email_layout import (
    badge,
    info_card,
    muted,
    p,
    render_system_email,
)
from app.core.i18n import i18n

logger = logging.getLogger(__name__)


def _clean_secret(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip().strip('"').strip("'")
    return cleaned or None


def normalize_email_language(lang: Optional[str]) -> str:
    """Map preference / Accept-Language to supported email locale (en|fr)."""
    if not lang:
        return "en"
    code = str(lang).strip().lower().replace("_", "-")
    if code.startswith("fr"):
        return "fr"
    return "en"


def _t(key: str, lang: str, **kwargs) -> str:
    return i18n.get(key, lang=normalize_email_language(lang), **kwargs)


class EmailSender:
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = _clean_secret(settings.SMTP_USER)
        self.smtp_password = _clean_secret(settings.SMTP_PASSWORD)
        self.smtp_tls = settings.SMTP_TLS
        self.from_email = (settings.EMAILS_FROM_EMAIL or "").strip()
        self.from_name = settings.SMTP_FROM_NAME or "LeadLab"
        self.resend_api_key = _clean_secret(settings.RESEND_API_KEY)
        self.resend_from_email = _clean_secret(settings.RESEND_FROM_EMAIL) or self.from_email
        self.mock_mode_enabled = (settings.ENV or "").lower() == "development"
        self.last_error: Optional[str] = None

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str = None,
        attachments: List[dict] = None,
        reply_to: Optional[str] = None,
    ) -> bool:
        """Send email with SMTP-first strategy (Gmail-friendly)."""
        self.last_error = None
        provider_mode = (settings.EMAIL_PROVIDER or "smtp").lower().strip()
        if provider_mode not in {"smtp", "api", "auto"}:
            provider_mode = "smtp"
        reply_addr = (reply_to or "").strip() or "info@the-leadlab.com"

        if provider_mode == "api":
            return await self._send_via_resend_api(
                to_email=to_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                attachments=attachments,
                reply_to=reply_addr,
            )

        # smtp (default) and auto: try SMTP first, then Resend if configured.
        # Prevents silent failures when SMTP_PASSWORD is missing on Render.
        smtp_sent = await self._send_via_smtp(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            attachments=attachments,
            reply_to=reply_addr,
        )
        if smtp_sent:
            return True
        if self.resend_api_key:
            return await self._send_via_resend_api(
                to_email=to_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                attachments=attachments,
                reply_to=reply_addr,
            )
        return False

    @staticmethod
    def _attach_file_parts(message: MIMEMultipart, attachments: Optional[List[dict]]) -> None:
        if not attachments:
            return
        for attachment in attachments:
            raw = attachment.get("content") or b""
            if isinstance(raw, str):
                raw = raw.encode("utf-8")
            filename = attachment.get("filename") or "attachment"
            content_type = (attachment.get("content_type") or "application/octet-stream").split(";")[0].strip()
            maintype, _, subtype = content_type.partition("/")
            if not maintype or not subtype:
                maintype, subtype = "application", "octet-stream"
            part = MIMEBase(maintype, subtype)
            part.set_payload(raw)
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                "attachment",
                filename=filename,
            )
            message.attach(part)

    async def _send_via_smtp(
        self,
        *,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        attachments: Optional[List[dict]] = None,
        reply_to: Optional[str] = None,
    ) -> bool:
        # Check if SMTP is properly configured
        if not self.smtp_user or not self.smtp_password:
            if self.mock_mode_enabled:
                print(f"📧 SMTP credentials not configured, running in mock mode")
                print(f"📧 MOCK: Email to {to_email}")
                print(f"📧 MOCK: Subject: {subject}")
                print(f"📧 MOCK: Content: {html_content[:100]}...")
                return True
            self.last_error = "SMTP credentials not configured (SMTP_USER/SMTP_PASSWORD)"
            print(f"❌ SMTP credentials not configured for {to_email}")
            return False

        try:
            # mixed root so file attachments are real downloadable parts
            message = MIMEMultipart("mixed")
            message["Subject"] = subject
            # For SMTP/Gmail, prefer authenticated SMTP user as sender.
            from_email = self.smtp_user or self.from_email
            message["From"] = f"{self.from_name} <{from_email}>"
            message["To"] = to_email
            if reply_to:
                message["Reply-To"] = reply_to

            body = MIMEMultipart("alternative")
            if text_content:
                body.attach(MIMEText(text_content, "plain"))
            body.attach(MIMEText(html_content, "html"))
            message.attach(body)
            self._attach_file_parts(message, attachments)

            context = ssl.create_default_context()
            use_tls = self.smtp_tls and self.smtp_port == 465
            start_tls = self.smtp_tls and self.smtp_port != 465

            await aiosmtplib.send(
                message,
                hostname=self.smtp_host,
                port=self.smtp_port,
                username=self.smtp_user,
                password=self.smtp_password,
                use_tls=use_tls,
                start_tls=start_tls,
                tls_context=context,
            )

            print(f"✅ Email sent successfully to {to_email} via SMTP")
            return True
        except Exception as e:
            print(f"❌ Failed to send email via SMTP to {to_email}: {str(e)}")
            if self.mock_mode_enabled:
                print(f"📧 MOCK: Email to {to_email}")
                print(f"📧 MOCK: Subject: {subject}")
                print(f"📧 MOCK: Content: {html_content[:100]}...")
                return True
            return False

    async def _send_via_resend_api(
        self,
        *,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        attachments: Optional[List[dict]] = None,
        reply_to: Optional[str] = None,
    ) -> bool:
        if not self.resend_api_key:
            self.last_error = "RESEND_API_KEY is not configured"
            logger.error("%s (to=%s)", self.last_error, to_email)
            print(f"❌ {self.last_error} for {to_email}")
            return False

        from_addr = self.resend_from_email or self.from_email
        if not from_addr:
            self.last_error = "No Resend from address (set EMAILS_FROM_EMAIL or RESEND_FROM_EMAIL)"
            logger.error("%s", self.last_error)
            return False

        payload = {
            "from": f"{self.from_name} <{from_addr}>",
            "to": [to_email],
            "subject": subject,
            "html": html_content,
            "reply_to": (reply_to or "").strip() or "info@the-leadlab.com",
        }
        if text_content:
            payload["text"] = text_content
        if attachments:
            import base64

            resend_files = []
            for attachment in attachments:
                raw = attachment.get("content") or b""
                if isinstance(raw, str):
                    raw = raw.encode("utf-8")
                if not raw:
                    continue
                resend_files.append(
                    {
                        "filename": attachment.get("filename") or "attachment",
                        "content": base64.b64encode(raw).decode("ascii"),
                    }
                )
            if resend_files:
                payload["attachments"] = resend_files

        headers = {
            "Authorization": f"Bearer {self.resend_api_key}",
            "Content-Type": "application/json",
        }

        try:
            timeout = float(getattr(settings, "EMAIL_PROVIDER_TIMEOUT_SECONDS", 12) or 12)
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    json=payload,
                    headers=headers,
                )
                if response.status_code >= 400:
                    error_detail = response.text
                    try:
                        error_data = response.json()
                        error_detail = error_data.get("message") or error_data.get("name") or str(error_data)
                    except Exception:
                        pass
                    self.last_error = f"Resend HTTP {response.status_code}: {error_detail}"
                    logger.error(
                        "Resend failed to=%s from=%s status=%s detail=%s",
                        to_email,
                        from_addr,
                        response.status_code,
                        error_detail,
                    )
                    print(f"❌ Failed to send email via Resend API to {to_email}: {error_detail}")
                    print(f"   Status: {response.status_code}")
                    return False

                response_data = response.json()
                email_id = response_data.get("id", "unknown")
                logger.info("Resend OK to=%s id=%s", to_email, email_id)
                print(f"✅ Email sent successfully to {to_email} via Resend API (ID: {email_id})")
                return True
        except Exception as e:
            self.last_error = f"Resend exception: {e}"
            logger.error("Resend exception to=%s: %s", to_email, e, exc_info=True)
            print(f"❌ Failed to send email via Resend API to {to_email}: {str(e)}")
            return False

    async def send_welcome_email(
        self,
        to_email: str,
        first_name: str,
        login_link: str,
        language: Optional[str] = None,
    ) -> bool:
        """Send welcome email to new users"""
        lang = normalize_email_language(language)
        subject = _t("email.welcome.subject", lang)
        body = (
            p(_t("email.welcome.greeting", lang, first_name=first_name))
            + p(_t("email.welcome.body", lang))
            + info_card(
                f"<p style='margin:0 0 8px 0;font-size:14px;font-weight:600;color:#0f172a;'>{_t('email.welcome.whatYouCanDo', lang)}</p>"
                f"<p style='margin:0 0 6px 0;font-size:14px;line-height:1.5;color:#334155;'>{_t('email.welcome.perk1', lang)}</p>"
                f"<p style='margin:0 0 6px 0;font-size:14px;line-height:1.5;color:#334155;'>{_t('email.welcome.perk2', lang)}</p>"
                f"<p style='margin:0 0 6px 0;font-size:14px;line-height:1.5;color:#334155;'>{_t('email.welcome.perk3', lang)}</p>"
                f"<p style='margin:0;font-size:14px;line-height:1.5;color:#334155;'>{_t('email.welcome.perk4', lang)}</p>"
            )
            + p(_t("email.welcome.ctaPrompt", lang))
        )
        html_content, _ = render_system_email(
            title=_t("email.welcome.title", lang),
            preheader=_t("email.welcome.preheader", lang, first_name=first_name),
            body_html=body,
            cta_label=_t("email.welcome.cta", lang),
            cta_url=login_link,
        )
        text_content = (
            f"{subject}\n\n"
            f"{_t('email.welcome.greeting', lang, first_name=first_name)}\n\n"
            f"{_t('email.welcome.textBody', lang, login_link=login_link)}"
        )
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_email_verification(
        self,
        to_email: str,
        first_name: str,
        verification_link: str,
        language: Optional[str] = None,
    ) -> bool:
        """Send email verification email"""
        lang = normalize_email_language(language)
        subject = _t("email.verify.subject", lang)
        body = (
            p(_t("email.verify.greeting", lang, first_name=first_name))
            + p(_t("email.verify.body", lang))
            + muted(_t("email.verify.expires", lang))
            + muted(_t("email.verify.ignore", lang))
        )
        html_content, _ = render_system_email(
            title=_t("email.verify.title", lang),
            preheader=_t("email.verify.preheader", lang),
            body_html=body,
            cta_label=_t("email.verify.cta", lang),
            cta_url=verification_link,
        )
        text_content = (
            f"{subject}\n\n"
            f"{_t('email.verify.greeting', lang, first_name=first_name)}\n\n"
            f"{_t('email.verify.textBody', lang, verification_link=verification_link)}"
        )
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_token_purchase_confirmation(
        self,
        to_email: str,
        username: str,
        amount: float,
        token_amount: float,
        language: Optional[str] = None,
    ) -> bool:
        """Send confirmation email for token purchases"""
        lang = normalize_email_language(language)
        amount_s = f"{amount:.2f}"
        tokens_s = f"{token_amount:.2f}"
        subject = _t("email.tokens.subject", lang)
        body = (
            p(_t("email.tokens.greeting", lang, username=username))
            + p(_t("email.tokens.body", lang))
            + info_card(
                f"<p style='margin:0 0 8px 0;font-size:14px;color:#64748b;'>{_t('email.tokens.amountPaid', lang)}</p>"
                f"<p style='margin:0 0 16px 0;font-size:20px;font-weight:700;color:#0f172a;'>${amount_s}</p>"
                f"<p style='margin:0 0 8px 0;font-size:14px;color:#64748b;'>{_t('email.tokens.tokensReceived', lang)}</p>"
                f"<p style='margin:0;font-size:20px;font-weight:700;color:#0f172a;'>{tokens_s}</p>"
            )
        )
        html_content, _ = render_system_email(
            title=_t("email.tokens.title", lang),
            preheader=_t("email.tokens.preheader", lang, token_amount=tokens_s),
            body_html=body,
        )
        text_content = (
            f"{subject}\n\n"
            f"{_t('email.tokens.greeting', lang, username=username)}\n\n"
            f"{_t('email.tokens.textBody', lang, amount=amount_s, token_amount=tokens_s)}"
        )
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_password_reset(
        self,
        to_email: str,
        reset_link: str,
        language: Optional[str] = None,
    ) -> bool:
        """Send password reset email"""
        lang = normalize_email_language(language)
        subject = _t("email.passwordReset.subject", lang)
        body = (
            p(_t("email.passwordReset.greeting", lang))
            + p(_t("email.passwordReset.body", lang))
            + muted(_t("email.passwordReset.expires", lang))
            + muted(_t("email.passwordReset.ignore", lang))
        )
        html_content, _ = render_system_email(
            title=_t("email.passwordReset.title", lang),
            preheader=_t("email.passwordReset.preheader", lang),
            body_html=body,
            cta_label=_t("email.passwordReset.cta", lang),
            cta_url=reset_link,
        )
        text_content = (
            f"{subject}\n\n"
            f"{_t('email.passwordReset.greeting', lang)}\n\n"
            f"{_t('email.passwordReset.textBody', lang, reset_link=reset_link)}"
        )
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_notification_alert(
        self,
        to_email: str,
        title: str,
        message: str,
        action_url: Optional[str] = None,
        recipient_name: Optional[str] = None,
        language: Optional[str] = None,
    ) -> bool:
        """Email mirror of an in-app notification."""
        lang = normalize_email_language(language)
        recipient = recipient_name or ("there" if lang == "en" else "bonjour")
        if lang == "fr" and not recipient_name:
            recipient = "bonjour"
        subject = title or ("LeadLab notification" if lang == "en" else "Notification LeadLab")
        greeting = (
            f"Hi {recipient},"
            if lang == "en"
            else f"Bonjour {recipient},"
        )
        body = p(greeting) + p(message or "")
        if action_url:
            cta_label = "Open in LeadLab" if lang == "en" else "Ouvrir dans LeadLab"
            html_content, _ = render_system_email(
                title=subject,
                preheader=(message or subject)[:120],
                body_html=body,
                cta_label=cta_label,
                cta_url=action_url,
            )
            text_content = f"{greeting}\n\n{message or ''}\n\n{action_url}\n"
        else:
            html_content, _ = render_system_email(
                title=subject,
                preheader=(message or subject)[:120],
                body_html=body,
            )
            text_content = f"{greeting}\n\n{message or ''}\n"
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_assignment_mention(
        self,
        to_email: str,
        recipient_name: str,
        mentioner_name: str,
        entity_type: str,
        entity_title: str,
        entity_url: str,
        organization_name: Optional[str] = None,
        language: Optional[str] = None,
    ) -> bool:
        """Notify a teammate they were assigned / mentioned on a task or lead."""
        lang = normalize_email_language(language)
        entity_key = (entity_type or "item").strip().lower()
        if entity_key not in {"task", "lead", "deal"}:
            entity_key = "item"
        entity_label = _t(f"email.entity.{entity_key}", lang)
        org_bit = f" at {organization_name}" if organization_name else ""
        safe_title = entity_title or f"Untitled {entity_label}"
        recipient = recipient_name or ("there" if lang == "en" else "bonjour")
        if lang == "fr" and not recipient_name:
            recipient = "bonjour"
        subject = _t("email.mention.subject", lang, entity_label=entity_label)
        body = (
            p(_t("email.mention.greeting", lang, recipient_name=recipient))
            + p(
                _t(
                    "email.mention.body",
                    lang,
                    mentioner_name=mentioner_name,
                    entity_label=entity_label,
                    org_bit=org_bit,
                )
            )
            + info_card(
                f"<p style='margin:0 0 4px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;'>{entity_label}</p>"
                f"<p style='margin:0;font-size:18px;font-weight:600;color:#0f172a;'>{safe_title}</p>"
            )
        )
        html_content, _ = render_system_email(
            title=_t("email.mention.title", lang),
            preheader=_t(
                "email.mention.preheader",
                lang,
                mentioner_name=mentioner_name,
                entity_label=entity_label,
            ),
            body_html=body,
            cta_label=_t("email.mention.cta", lang),
            cta_url=entity_url,
        )
        text_content = _t(
            "email.mention.textBody",
            lang,
            recipient_name=recipient,
            mentioner_name=mentioner_name,
            entity_label=entity_label,
            org_bit=org_bit,
            safe_title=safe_title,
            entity_url=entity_url,
        )
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_team_invitation(
        self,
        to_email: str,
        inviter_name: str,
        organization_name: str,
        invitation_link: str,
        role: str = "member",
        message: str = None,
        language: Optional[str] = None,
    ) -> bool:
        """Send team invitation email"""
        lang = normalize_email_language(language)
        subject = _t(
            "email.invite.subject",
            lang,
            organization_name=organization_name,
        )

        role_key = {
            "admin": "email.invite.roleAdmin",
            "member": "email.invite.roleMember",
            "viewer": "email.invite.roleViewer",
        }.get(role, "email.invite.roleMember")
        role_text = _t(role_key, lang)

        perks = [
            _t("email.invite.perkLeads", lang),
            _t("email.invite.perkAnalytics", lang),
            _t("email.invite.perkCollaborate", lang),
        ]
        if role == "admin":
            perks.insert(0, _t("email.invite.perkManage", lang))
        if role in ("admin", "member"):
            perks.append(_t("email.invite.perkCampaigns", lang))
        perks_html = "".join(
            f"<p style='margin:0 0 6px 0;font-size:14px;line-height:1.5;color:#334155;'>{item}</p>"
            for item in perks
        )

        message_html = ""
        message_block = ""
        if message:
            message_html = info_card(
                f"<p style='margin:0 0 6px 0;font-size:13px;font-weight:600;color:#0f172a;'>"
                f"{_t('email.invite.messageFrom', lang, inviter_name=inviter_name)}</p>"
                f"<p style='margin:0;font-size:14px;line-height:1.6;color:#334155;font-style:italic;'>"
                f"“{message}”</p>"
            )
            message_block = f'{_t("email.invite.messageFrom", lang, inviter_name=inviter_name)}: "{message}"\n\n'

        body = (
            p(
                _t(
                    "email.invite.body",
                    lang,
                    inviter_name=inviter_name,
                    organization_name=organization_name,
                )
            )
            + p(_t("email.invite.yourRole", lang, role_badge=badge(role_text)))
            + message_html
            + info_card(
                "<p style='margin:0 0 8px 0;font-size:14px;font-weight:600;color:#0f172a;'>"
                f"{_t('email.invite.asRoleYouCan', lang, role_text=role_text.lower())}</p>"
                + perks_html
            )
            + muted(_t("email.invite.expires", lang))
            + muted(_t("email.invite.noAccount", lang))
        )
        html_content, _ = render_system_email(
            title=_t("email.invite.title", lang, organization_name=organization_name),
            preheader=_t(
                "email.invite.preheader",
                lang,
                inviter_name=inviter_name,
                organization_name=organization_name,
            ),
            body_html=body,
            cta_label=_t("email.invite.cta", lang),
            cta_url=invitation_link,
            footer_note=_t(
                "email.invite.footer",
                lang,
                inviter_name=inviter_name,
                organization_name=organization_name,
            ),
        )
        text_content = (
            f"{subject}\n\n"
            + _t(
                "email.invite.textBody",
                lang,
                inviter_name=inviter_name,
                organization_name=organization_name,
                role_text=role_text,
                message_block=message_block,
                invitation_link=invitation_link,
            )
        )
        return await self.send_email(to_email, subject, html_content, text_content)

class InvoiceEmailSender:
    """Separate email sender for invoices using invoice-specific credentials"""
    
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.INVOICE_EMAIL
        self.smtp_password = settings.INVOICE_EMAIL_PASSWORD
        self.smtp_tls = settings.SMTP_TLS
        self.from_email = settings.INVOICE_EMAIL
        self.from_name = "LeadLab Invoicing"
        self.mock_mode_enabled = (settings.ENV or "").lower() == "development"

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str = None,
        attachments: List[dict] = None
    ) -> bool:
        """Send invoice email using invoice-specific SMTP settings"""
        
        # Check if SMTP is properly configured
        if not self.smtp_user or not self.smtp_password:
            if self.mock_mode_enabled:
                print(f"📧 Invoice SMTP credentials not configured, running in mock mode")
                print(f"📧 MOCK: Invoice email to {to_email}")
                print(f"📧 MOCK: Subject: {subject}")
                print(f"📧 MOCK: Content: {html_content[:100]}...")
                return True
            print(f"❌ Invoice SMTP credentials not configured for {to_email}")
            return False

        try:
            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = subject
            message["From"] = f"{self.from_name} <{self.from_email}>"
            message["To"] = to_email

            # Add text content if provided
            if text_content:
                text_part = MIMEText(text_content, "plain")
                message.attach(text_part)

            # Add HTML content
            html_part = MIMEText(html_content, "html")
            message.attach(html_part)

            # Add attachments if provided
            if attachments:
                for attachment in attachments:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(attachment['content'])
                    encoders.encode_base64(part)
                    part.add_header(
                        'Content-Disposition',
                        f'attachment; filename= {attachment["filename"]}'
                    )
                    message.attach(part)

            # Create SSL context
            context = ssl.create_default_context()

            # Send email
            await aiosmtplib.send(
                message,
                hostname=self.smtp_host,
                port=self.smtp_port,
                username=self.smtp_user,
                password=self.smtp_password,
                use_tls=self.smtp_tls,
                tls_context=context
            )

            print(f"✅ Invoice email sent successfully to {to_email}")
            return True

        except Exception as e:
            print(f"❌ Failed to send invoice email to {to_email}: {str(e)}")
            if self.mock_mode_enabled:
                # Keep mock mode for local development only.
                print(f"📧 MOCK: Invoice email to {to_email}")
                print(f"📧 MOCK: Subject: {subject}")
                print(f"📧 MOCK: Content: {html_content[:100]}...")
                return True
            return False

# Create global instances
email_sender = EmailSender()
invoice_email_sender = InvoiceEmailSender()
