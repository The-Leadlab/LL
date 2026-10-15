from typing import Any
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from app import schemas
from app.api import deps
from app.core.email import email_sender

router = APIRouter(redirect_slashes=False)

@router.post("", response_model=schemas.Msg)
@router.post("/", response_model=schemas.Msg)
async def send_contact_message(
    background_tasks: BackgroundTasks,
    *,
    message_in: schemas.ContactMessage,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Send contact form message.
    """
    # Create HTML content
    html_content = f"""
    <h2>New Contact Form Message</h2>
    <p><strong>From:</strong> {message_in.name} ({message_in.email})</p>
    <p><strong>Subject:</strong> {message_in.subject}</p>
    <p><strong>Message:</strong></p>
    <p>{message_in.message}</p>
    """

    # Send email asynchronously
    background_tasks.add_task(
        email_sender.send_email,
        to_email=message_in.to_email,
        subject=f"Contact Form: {message_in.subject}",
        html_content=html_content,
    )

    return {"msg": "Message sent successfully"}
