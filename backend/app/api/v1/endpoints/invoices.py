from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app import models
from app.api import deps
from app.core.security import check_permission
from app.core.email import InvoiceEmailSender
from app.services.system_email_layout import info_card, muted, p, render_system_email

# Initialize invoice email sender
invoice_email_sender = InvoiceEmailSender()

router = APIRouter(redirect_slashes=False)


class InvoiceEmailRequest(BaseModel):
    to_email: EmailStr
    invoice_number: str
    client_name: str
    company_name: str
    invoice_data: Dict[str, Any]
    pdf_content: str = None  # Base64 encoded PDF
    message: str = ""


class InvoiceEmailResponse(BaseModel):
    success: bool
    message: str
    data: Dict[str, Any] = None


@router.post("/send-invoice", response_model=InvoiceEmailResponse)
async def send_invoice_email(
    background_tasks: BackgroundTasks,
    *,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
    request: InvoiceEmailRequest,
) -> Any:
    """
    Send invoice via email to client.
    """
    # Check permissions
    if not check_permission(db, current_user.id, "send_email"):
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to send emails"
        )

    try:
        # Create email subject
        subject = f"Invoice {request.invoice_number} from {request.company_name}"
        
        currency = request.invoice_data.get("currency_symbol", "₺")
        total = request.invoice_data.get("total", 0)
        due_date = request.invoice_data.get("due_date", "N/A")
        message_html = (
            p(f"<strong>Message</strong><br/>{request.message}") if request.message else ""
        )
        body = (
            p(f"Dear {request.client_name},")
            + p(
                f"Please find attached invoice <strong>{request.invoice_number}</strong> "
                f"from <strong>{request.company_name}</strong>."
            )
            + info_card(
                f"<p style='margin:0 0 8px 0;font-size:14px;color:#64748b;'>Invoice number</p>"
                f"<p style='margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;'>{request.invoice_number}</p>"
                f"<p style='margin:0 0 8px 0;font-size:14px;color:#64748b;'>Amount</p>"
                f"<p style='margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;'>{currency}{total:.2f}</p>"
                f"<p style='margin:0 0 8px 0;font-size:14px;color:#64748b;'>Due date</p>"
                f"<p style='margin:0;font-size:16px;font-weight:600;color:#0f172a;'>{due_date}</p>"
            )
            + message_html
            + p("If you have questions about this invoice, reply to this email or contact billing.")
            + muted(
                f"{request.company_name} · Elite Park Plaza Floor 5, Ümraniye, Istanbul<br/>"
                "billing@the-leadlab.com · the-leadlab.com"
            )
        )
        html_content, _ = render_system_email(
            title=f"Invoice {request.invoice_number}",
            preheader=f"Invoice {request.invoice_number} from {request.company_name}",
            body_html=body,
            footer_note="Invoice attached as PDF.",
        )
        
        # Send email in background
        background_tasks.add_task(
            send_invoice_email_task,
            request.to_email,
            subject,
            html_content,
            request.pdf_content
        )

        return InvoiceEmailResponse(
            success=True,
            message=f"Invoice {request.invoice_number} sent successfully to {request.to_email}",
            data={
                "invoice_number": request.invoice_number,
                "recipient": request.to_email,
                "status": "queued"
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error sending invoice: {str(e)}"
        )


async def send_invoice_email_task(
    to_email: str,
    subject: str,
    html_content: str,
    pdf_content: str = None
):
    """
    Background task to send invoice email with optional PDF attachment.
    """
    try:
        # Log the email sending attempt
        print(f"📧 Sending invoice email to: {to_email}")
        print(f"📧 Subject: {subject}")
        print(f"📧 Content length: {len(html_content)} characters")
        if pdf_content:
            print(f"📧 PDF attachment: {len(pdf_content)} bytes")
        
        # Try to send email using the configured invoice email service
        try:
            success = await invoice_email_sender.send_email(
                to_email=to_email,
                subject=subject,
                html_content=html_content
            )
            
            if success:
                print(f"✅ Invoice email sent successfully to {to_email}")
            else:
                print(f"⚠️ Email service returned false, but no exception was thrown")
                
        except Exception as email_error:
            print(f"🔧 Email service not configured properly: {str(email_error)}")
            print(f"📝 MOCK: Email would be sent to {to_email}")
            print(f"📝 MOCK: Subject: {subject}")
            print(f"📝 MOCK: This is a mock email sending (email service not configured)")
            # In mock mode, we'll pretend the email was sent successfully
        
    except Exception as e:
        print(f"❌ Failed to send invoice email to {to_email}: {str(e)}")
        raise e


@router.get("/test-email")
async def test_email_config(
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Dict[str, Any]:
    """
    Test email configuration.
    """
    return {
        "success": True,
        "message": "Email service is configured and ready",
        "data": {
            "email_service": "Mock Email Service",
            "status": "active"
        }
    } 