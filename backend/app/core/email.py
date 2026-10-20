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

logger = logging.getLogger(__name__)


def _clean_secret(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip().strip('"').strip("'")
    return cleaned or None


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

    async def send_welcome_email(self, to_email: str, first_name: str, login_link: str) -> bool:
        """Send welcome email to new users"""
        subject = "Welcome to LeadLab"
        body = (
            p(f"Hi {first_name},")
            + p(
                "Welcome to LeadLab. We're glad you're here — your workspace is ready "
                "for lead generation, CRM, and team collaboration."
            )
            + info_card(
                "<p style='margin:0 0 8px 0;font-size:14px;font-weight:600;color:#0f172a;'>What you can do</p>"
                "<p style='margin:0 0 6px 0;font-size:14px;line-height:1.5;color:#334155;'>Generate and qualify leads</p>"
                "<p style='margin:0 0 6px 0;font-size:14px;line-height:1.5;color:#334155;'>Track performance with analytics</p>"
                "<p style='margin:0 0 6px 0;font-size:14px;line-height:1.5;color:#334155;'>Run outreach campaigns</p>"
                "<p style='margin:0;font-size:14px;line-height:1.5;color:#334155;'>Collaborate with your team</p>"
            )
            + p("Ready to get started? Open your dashboard below.")
        )
        html_content, _ = render_system_email(
            title="Welcome to LeadLab",
            preheader=f"Hi {first_name}, your LeadLab account is ready.",
            body_html=body,
            cta_label="Open dashboard",
            cta_url=login_link,
        )
        text_content = f"""Welcome to LeadLab

Hi {first_name},

Welcome to LeadLab. Your workspace is ready.

Open your dashboard:
{login_link}

Questions? info@the-leadlab.com

— The LeadLab Team
"""
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_email_verification(self, to_email: str, first_name: str, verification_link: str) -> bool:
        """Send email verification email"""
        subject = "Verify your email — LeadLab"
        body = (
            p(f"Hi {first_name},")
            + p(
                "Thanks for signing up. Confirm your email address to finish setup "
                "and unlock full access to LeadLab."
            )
            + muted("This link expires in <strong style='color:#0f172a;'>24 hours</strong>.")
            + muted("If you did not create a LeadLab account, you can ignore this email.")
        )
        html_content, _ = render_system_email(
            title="Verify your email",
            preheader="Confirm your email to finish LeadLab signup.",
            body_html=body,
            cta_label="Verify email address",
            cta_url=verification_link,
        )
        text_content = f"""Verify your email — LeadLab

Hi {first_name},

Confirm your email address:
{verification_link}

This link expires in 24 hours.

If you did not create a LeadLab account, ignore this email.

— The LeadLab Team
"""
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_token_purchase_confirmation(
        self,
        to_email: str,
        username: str,
        amount: float,
        token_amount: float
    ) -> bool:
        """Send confirmation email for token purchases"""
        subject = "Token purchase confirmation — LeadLab"
        body = (
            p(f"Hi {username},")
            + p("Thank you for your purchase. Your tokens are available in your account.")
            + info_card(
                f"<p style='margin:0 0 8px 0;font-size:14px;color:#64748b;'>Amount paid</p>"
                f"<p style='margin:0 0 16px 0;font-size:20px;font-weight:700;color:#0f172a;'>${amount:.2f}</p>"
                f"<p style='margin:0 0 8px 0;font-size:14px;color:#64748b;'>Tokens received</p>"
                f"<p style='margin:0;font-size:20px;font-weight:700;color:#0f172a;'>{token_amount:.2f}</p>"
            )
        )
        html_content, _ = render_system_email(
            title="Token purchase confirmed",
            preheader=f"You received {token_amount:.2f} tokens.",
            body_html=body,
        )
        text_content = f"""Token purchase confirmation — LeadLab

Hi {username},

Amount paid: ${amount:.2f}
Tokens received: {token_amount:.2f}

Your tokens have been added to your account balance.

— The LeadLab Team
"""
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_password_reset(self, to_email: str, reset_link: str) -> bool:
        """Send password reset email"""
        subject = "Reset your LeadLab password"
        body = (
            p("Hello,")
            + p(
                "We received a request to reset the password for your LeadLab account. "
                "Click the button below to choose a new one."
            )
            + muted("This link expires in <strong style='color:#0f172a;'>1 hour</strong> for your security.")
            + muted("If you did not request a password reset, you can ignore this email — your account stays secure.")
        )
        html_content, _ = render_system_email(
            title="Reset your password",
            preheader="Reset your LeadLab password. This link expires in 1 hour.",
            body_html=body,
            cta_label="Reset password",
            cta_url=reset_link,
        )
        text_content = f"""Reset your LeadLab password

Hello,

We received a request to reset the password for your LeadLab account.

Reset your password:
{reset_link}

This link expires in 1 hour for your security.

If you didn't request a password reset, you can ignore this email — your account stays secure.

Need help? Contact info@the-leadlab.com
"""
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
    ) -> bool:
        """Notify a teammate they were assigned / mentioned on a task or lead."""
        entity_label = (entity_type or "item").strip().lower()
        if entity_label not in {"task", "lead", "deal"}:
            entity_label = "item"
        subject = f"You were mentioned on a {entity_label} in LeadLab"
        org_bit = f" at {organization_name}" if organization_name else ""
        safe_title = entity_title or f"Untitled {entity_label}"
        body = (
            p(f"Hi {recipient_name or 'there'},")
            + p(f"<strong>{mentioner_name}</strong> mentioned you on a {entity_label}{org_bit}:")
            + info_card(
                f"<p style='margin:0 0 4px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;'>{entity_label}</p>"
                f"<p style='margin:0;font-size:18px;font-weight:600;color:#0f172a;'>{safe_title}</p>"
            )
        )
        html_content, _ = render_system_email(
            title="You were mentioned",
            preheader=f"{mentioner_name} mentioned you on a {entity_label}",
            body_html=body,
            cta_label="Open in LeadLab",
            cta_url=entity_url,
        )
        text_content = (
            f"Hi {recipient_name or 'there'},\n\n"
            f"{mentioner_name} mentioned you on a {entity_label}{org_bit}: {safe_title}\n\n"
            f"Open it here: {entity_url}\n\n"
            f"— LeadLab"
        )
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_team_invitation(
        self,
        to_email: str,
        inviter_name: str,
        organization_name: str,
        invitation_link: str,
        role: str = "member",
        message: str = None
    ) -> bool:
        """Send team invitation email"""
        subject = f"You're invited to join {organization_name} on LeadLab"

        role_display = {
            "admin": "Administrator",
            "member": "Team Member",
            "viewer": "Viewer",
        }
        role_text = role_display.get(role, role.title())

        perks = [
            "Access lead management tools",
            "View analytics and reports",
            "Collaborate with your team",
        ]
        if role == "admin":
            perks.insert(0, "Manage team members and settings")
        if role in ("admin", "member"):
            perks.append("Create and manage campaigns")
        perks_html = "".join(
            f"<p style='margin:0 0 6px 0;font-size:14px;line-height:1.5;color:#334155;'>{item}</p>"
            for item in perks
        )

        message_html = ""
        if message:
            message_html = info_card(
                f"<p style='margin:0 0 6px 0;font-size:13px;font-weight:600;color:#0f172a;'>"
                f"Message from {inviter_name}</p>"
                f"<p style='margin:0;font-size:14px;line-height:1.6;color:#334155;font-style:italic;'>"
                f"“{message}”</p>"
            )

        body = (
            p(f"<strong>{inviter_name}</strong> invited you to join <strong>{organization_name}</strong> on LeadLab.")
            + p(f"Your role: {badge(role_text)}")
            + message_html
            + info_card(
                "<p style='margin:0 0 8px 0;font-size:14px;font-weight:600;color:#0f172a;'>"
                f"As a {role_text.lower()}, you can</p>"
                + perks_html
            )
            + muted("This invitation expires in <strong style='color:#0f172a;'>72 hours</strong>.")
            + muted(
                "No account yet? This link opens signup so you can create one and join the team."
            )
        )
        html_content, _ = render_system_email(
            title=f"Join {organization_name}",
            preheader=f"{inviter_name} invited you to {organization_name} on LeadLab.",
            body_html=body,
            cta_label="Accept invitation",
            cta_url=invitation_link,
            footer_note=f"You received this because {inviter_name} invited you to {organization_name}.",
        )
        text_content = f"""You're invited to join {organization_name} on LeadLab

{inviter_name} invited you to join {organization_name} on LeadLab.

Your role: {role_text}

{f'Message from {inviter_name}: "{message}"' if message else ''}

Accept invitation:
{invitation_link}

This invitation expires in 72 hours.

Questions? info@the-leadlab.com

— The LeadLab Team
"""
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
