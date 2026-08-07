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
        attachments: List[dict] = None
    ) -> bool:
        """Send email with SMTP-first strategy (Gmail-friendly)."""
        self.last_error = None
        provider_mode = (settings.EMAIL_PROVIDER or "smtp").lower().strip()
        if provider_mode not in {"smtp", "api", "auto"}:
            provider_mode = "smtp"

        if provider_mode == "api":
            return await self._send_via_resend_api(
                to_email=to_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
            )

        # smtp (default) and auto: try SMTP first, then Resend if configured.
        # Prevents silent failures when SMTP_PASSWORD is missing on Render.
        smtp_sent = await self._send_via_smtp(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            attachments=attachments,
        )
        if smtp_sent:
            return True
        if self.resend_api_key:
            return await self._send_via_resend_api(
                to_email=to_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
            )
        return False

    async def _send_via_smtp(
        self,
        *,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        attachments: Optional[List[dict]] = None,
    ) -> bool:
        # Check if SMTP is properly configured
        if not self.smtp_user or not self.smtp_password:
            if self.mock_mode_enabled:
                print(f"📧 SMTP credentials not configured, running in mock mode")
                print(f"📧 MOCK: Email to {to_email}")
                print(f"📧 MOCK: Subject: {subject}")
                print(f"📧 MOCK: Content: {html_content[:100]}...")
                return True
            print(f"❌ SMTP credentials not configured for {to_email}")
            return False

        try:
            message = MIMEMultipart("alternative")
            message["Subject"] = subject
            # For SMTP/Gmail, prefer authenticated SMTP user as sender.
            from_email = self.smtp_user or self.from_email
            message["From"] = f"{self.from_name} <{from_email}>"
            message["To"] = to_email

            if text_content:
                text_part = MIMEText(text_content, "plain")
                message.attach(text_part)

            html_part = MIMEText(html_content, "html")
            message.attach(html_part)

            if attachments:
                for attachment in attachments:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(attachment["content"])
                    encoders.encode_base64(part)
                    part.add_header(
                        "Content-Disposition",
                        f'attachment; filename= {attachment["filename"]}'
                    )
                    message.attach(part)

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
        text_content: Optional[str] = None
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
            "reply_to": "info@the-leadlab.com",
        }
        if text_content:
            payload["text"] = text_content

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
        subject = "Welcome to LeadLab! 🚀"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to LeadLab</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .btn {{ display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
                .logo {{ font-size: 24px; font-weight: bold; }}
                .features {{ background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }}
                .feature {{ margin: 10px 0; padding: 10px 0; border-bottom: 1px solid #eee; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">🚀 LeadLab</div>
                    <h1>Welcome to LeadLab!</h1>
                </div>
                <div class="content">
                    <p>Hi {first_name}!</p>
                    <p>Welcome to LeadLab! 🎉 We're thrilled to have you join our community of lead generation experts.</p>
                    
                    <div class="features">
                        <h3>🌟 What you can do with LeadLab:</h3>
                        <div class="feature">📈 <strong>Generate Quality Leads:</strong> Find and connect with potential customers</div>
                        <div class="feature">📊 <strong>Advanced Analytics:</strong> Track your lead generation performance</div>
                        <div class="feature">💼 <strong>CRM Integration:</strong> Seamlessly manage your customer relationships</div>
                        <div class="feature">📧 <strong>Email Campaigns:</strong> Create professional outreach campaigns</div>
                        <div class="feature">🎯 <strong>Lead Scoring:</strong> Prioritize your best prospects</div>
                    </div>
                    
                    <p>Ready to get started? Click the button below to log in to your account:</p>
                    <div style="text-align: center;">
                        <a href="{login_link}" class="btn">Access Your Dashboard</a>
                    </div>
                    
                    <p>If you have any questions or need assistance, our support team is here to help at info@the-leadlab.com</p>
                    
                    <p>Thank you for choosing LeadLab. Let's start generating amazing leads together!</p>
                </div>
                <div class="footer">
                    <p>© 2024 LeadLab. All rights reserved.<br>
                    This email was sent from an automated system. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        text_content = f"""
Welcome to LeadLab! - {first_name}

Hi {first_name}!

Welcome to LeadLab! We're thrilled to have you join our community of lead generation experts.

What you can do with LeadLab:
• Generate Quality Leads: Find and connect with potential customers
• Advanced Analytics: Track your lead generation performance  
• CRM Integration: Seamlessly manage your customer relationships
• Email Campaigns: Create professional outreach campaigns
• Lead Scoring: Prioritize your best prospects

Ready to get started? Log in to your account here:
{login_link}

If you have any questions or need assistance, our support team is here to help at info@the-leadlab.com

Thank you for choosing LeadLab. Let's start generating amazing leads together!

Best regards,
The LeadLab Team

© 2024 LeadLab. All rights reserved.
This email was sent from an automated system. Please do not reply to this email.
        """
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_email_verification(self, to_email: str, first_name: str, verification_link: str) -> bool:
        """Send email verification email"""
        subject = "Please Verify Your Email - LeadLab"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .btn {{ display: inline-block; background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
                .logo {{ font-size: 24px; font-weight: bold; }}
                .warning {{ background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">🚀 LeadLab</div>
                    <h1>Verify Your Email</h1>
                </div>
                <div class="content">
                    <p>Hi {first_name}!</p>
                    <p>Thank you for signing up for LeadLab! To complete your registration and secure your account, please verify your email address.</p>
                    
                    <div style="text-align: center;">
                        <a href="{verification_link}" class="btn">Verify Email Address</a>
                    </div>
                    
                    <div class="warning">
                        <p><strong>⚠️ Important:</strong> This verification link will expire in 24 hours for security reasons.</p>
                    </div>
                    
                    <p>Once verified, you'll have full access to all LeadLab features including:</p>
                    <ul>
                        <li>Lead generation tools</li>
                        <li>Advanced analytics dashboard</li>
                        <li>CRM integration</li>
                        <li>Email campaign management</li>
                    </ul>
                    
                    <p>If you didn't create an account with LeadLab, you can safely ignore this email.</p>
                    
                    <p>Having trouble? Contact our support team at info@the-leadlab.com</p>
                </div>
                <div class="footer">
                    <p>© 2024 LeadLab. All rights reserved.<br>
                    This email was sent from an automated system. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        text_content = f"""
Verify Your Email - LeadLab

Hi {first_name}!

Thank you for signing up for LeadLab! To complete your registration and secure your account, please verify your email address.

Click the link below to verify your email:
{verification_link}

⚠️ Important: This verification link will expire in 24 hours for security reasons.

Once verified, you'll have full access to all LeadLab features including:
• Lead generation tools
• Advanced analytics dashboard  
• CRM integration
• Email campaign management

If you didn't create an account with LeadLab, you can safely ignore this email.

Having trouble? Contact our support team at info@the-leadlab.com

Best regards,
The LeadLab Team

© 2024 LeadLab. All rights reserved.
This email was sent from an automated system. Please do not reply to this email.
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
        subject = "Token Purchase Confirmation - LeadLab"
        html_content = f"""
        <html>
            <body>
                <h2>Token Purchase Confirmation</h2>
                <p>Dear {username},</p>
                <p>Thank you for your token purchase. Here are your transaction details:</p>
                <ul>
                    <li>Amount Paid: ${amount:.2f}</li>
                    <li>Tokens Received: {token_amount:.2f}</li>
                </ul>
                <p>Your tokens have been added to your account balance and are ready to use.</p>
                <p>Best regards,<br>The LeadLab Team</p>
            </body>
        </html>
        """
        text_content = f"""
        Token Purchase Confirmation

        Dear {username},

        Thank you for your token purchase. Here are your transaction details:

        Amount Paid: ${amount:.2f}
        Tokens Received: {token_amount:.2f}

        Your tokens have been added to your account balance and are ready to use.

        Best regards,
        The LeadLab Team
        """
        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_password_reset(self, to_email: str, reset_link: str) -> bool:
        """Send password reset email"""
        subject = "Password Reset Request - LeadLab"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Request</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .btn {{ display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
                .logo {{ font-size: 24px; font-weight: bold; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">🚀 LeadLab</div>
                    <h1>Password Reset Request</h1>
                </div>
                <div class="content">
                    <p>Hello!</p>
                    <p>We received a request to reset your password for your LeadLab account. Click the button below to create a new password:</p>
                    <div style="text-align: center;">
                        <a href="{reset_link}" class="btn">Reset Your Password</a>
                    </div>
                    <p>This link will expire in 1 hour for security reasons.</p>
                    <p>If you didn't request this password reset, you can safely ignore this email. Your account will remain secure.</p>
                    <p>Need help? Contact our support team at info@the-leadlab.com</p>
                </div>
                <div class="footer">
                    <p>© 2024 LeadLab. All rights reserved.<br>
                    This email was sent from an automated system. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        text_content = f"""
Password Reset Request - LeadLab

Hello!

We received a request to reset your password for your LeadLab account.

Click the link below to reset your password:
{reset_link}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, you can safely ignore this email. Your account will remain secure.

Need help? Contact our support team at info@the-leadlab.com

Best regards,
The LeadLab Team

© 2024 LeadLab. All rights reserved.
This email was sent from an automated system. Please do not reply to this email.
        """
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
        subject = f"Sign up invitation: join {organization_name} on LeadLab"
        
        # Role display mapping
        role_display = {
            "admin": "Administrator",
            "member": "Team Member", 
            "viewer": "Viewer"
        }
        role_text = role_display.get(role, role.title())
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Team Invitation</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .btn {{ display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
                .logo {{ font-size: 24px; font-weight: bold; }}
                .logo img {{ max-height: 40px; width: auto; }}
                .invitation-box {{ background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0; }}
                .role-badge {{ background: #667eea; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; display: inline-block; }}
                .message-box {{ background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 3px solid #667eea; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">
                        <img src="https://the-leadlab.com/leadlab-logo.png" alt="LeadLab" />
                    </div>
                    <h1>Team Invitation</h1>
                </div>
                <div class="content">
                    <div class="invitation-box">
                        <h2>🎉 You're Invited!</h2>
                        <p><strong>{inviter_name}</strong> has invited you to join <strong>{organization_name}</strong> on LeadLab.</p>
                        <p>Your role: <span class="role-badge">{role_text}</span></p>
                    </div>
                    
                    {f'<div class="message-box"><strong>Personal message from {inviter_name}:</strong><br>"{message}"</div>' if message else ''}
                    
                    <p>LeadLab helps teams manage leads, track opportunities, and grow their business together. As a {role_text.lower()}, you'll be able to:</p>
                    <ul>
                        {"<li>Manage team members and settings</li>" if role == "admin" else ""}
                        <li>Access lead management tools</li>
                        <li>View analytics and reports</li>
                        <li>Collaborate with your team</li>
                        {"<li>Create and manage campaigns</li>" if role in ["admin", "member"] else ""}
                    </ul>
                    
                    <div style="text-align: center;">
                        <a href="{invitation_link}" class="btn">Sign up and join team</a>
                    </div>
                    
                    <p><strong>⏰ Important:</strong> This invitation will expire in 72 hours.</p>
                    
                    <p>Don't have a LeadLab account yet? No problem. This invitation link opens signup so you can create your account and join the team.</p>
                    
                    <p>Questions? Contact our support team at info@the-leadlab.com</p>
                </div>
                <div class="footer">
                    <p>© 2024 LeadLab. All rights reserved.<br>
                    You received this email because {inviter_name} invited you to join {organization_name}.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
Team Invitation - LeadLab

🎉 You're Invited!

{inviter_name} has invited you to join {organization_name} on LeadLab.

Your role: {role_text}

{f'Personal message from {inviter_name}: "{message}"' if message else ''}

LeadLab helps teams manage leads, track opportunities, and grow their business together. As a {role_text.lower()}, you'll be able to:

{'• Manage team members and settings' if role == "admin" else ''}
• Access lead management tools
• View analytics and reports  
• Collaborate with your team
{'• Create and manage campaigns' if role in ["admin", "member"] else ''}

To sign up and join this team, click the link below:
{invitation_link}

⏰ Important: This invitation will expire in 72 hours.

Don't have a LeadLab account yet? No problem. This invitation link opens signup so you can create one and join the team.

Questions? Contact our support team at info@the-leadlab.com

Best regards,
The LeadLab Team

© 2024 LeadLab. All rights reserved.
You received this email because {inviter_name} invited you to join {organization_name}.
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
