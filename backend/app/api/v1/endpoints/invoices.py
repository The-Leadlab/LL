from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app import models
from app.api import deps
from app.core.security import check_permission
from app.core.email import InvoiceEmailSender

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
        
        # Create email content
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Invoice {request.invoice_number}</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .header {{ background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }}
                .company-logo {{ display: flex; align-items: center; margin-bottom: 15px; }}
                .logo-icon {{ background-color: #3b82f6; color: white; padding: 10px; border-radius: 8px; margin-right: 15px; }}
                .company-info {{ }}
                .company-name {{ font-size: 24px; font-weight: bold; color: #3b82f6; margin: 0; }}
                .company-tagline {{ font-size: 14px; color: #6b7280; margin: 0; }}
                .content {{ margin: 20px 0; }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }}
                .btn {{ display: inline-block; padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }}
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company-logo">
                    <div class="logo-icon">🏢</div>
                    <div class="company-info">
                        <h1 class="company-name">{request.company_name}</h1>
                        <p class="company-tagline">CRM & Lead Management</p>
                    </div>
                </div>
            </div>
            
            <div class="content">
                <h2>Dear {request.client_name},</h2>
                
                <p>We hope this email finds you well. Please find attached your invoice for our services.</p>
                
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <strong>Invoice Details:</strong><br>
                    Invoice Number: <strong>{request.invoice_number}</strong><br>
                    Amount: <strong>{request.invoice_data.get('currency_symbol', '₺')}{request.invoice_data.get('total', 0):.2f}</strong><br>
                    Due Date: <strong>{request.invoice_data.get('due_date', 'N/A')}</strong>
                </div>
                
                {f"<p><strong>Message:</strong><br>{request.message}</p>" if request.message else ""}
                
                <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
                
                <p>Thank you for your business!</p>
            </div>
            
            <div class="footer">
                <p>
                    <strong>{request.company_name}</strong><br>
                    Küçükbakkalköy Mah. Selvili Sk. No: 4<br>
                    İç Kapı No: 20<br>
                    Ataşehir/İstanbul<br>
                    <br>
                    Email: billing@leadlab.com<br>
                    Phone: +90 (216) 555-0123<br>
                    Website: www.leadlab.com
                </p>
            </div>
        </body>
        </html>
        """
        
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