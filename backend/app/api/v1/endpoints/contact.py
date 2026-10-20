from typing import Any
from html import escape

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from app import schemas
from app.api import deps
from app.core.email import email_sender
from app.services.system_email_layout import info_card, p, render_system_email

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
    body = (
        info_card(
            f"<p style='margin:0 0 8px 0;font-size:14px;color:#334155;'><strong>From:</strong> {escape(message_in.name)} "
            f"(&lt;{escape(message_in.email)}&gt;)</p>"
            f"<p style='margin:0;font-size:14px;color:#334155;'><strong>Subject:</strong> {escape(message_in.subject)}</p>"
        )
        + p("<strong>Message</strong>")
        + p(escape(message_in.message).replace("\n", "<br/>"))
    )
    html_content, _ = render_system_email(
        title="New contact form message",
        preheader=f"From {message_in.name}: {message_in.subject}",
        body_html=body,
        footer_note="Internal ops notification from the-leadlab.com/contact.",
    )

    background_tasks.add_task(
        email_sender.send_email,
        to_email=message_in.to_email,
        subject=f"Contact Form: {message_in.subject}",
        html_content=html_content,
    )

    return {"msg": "Message sent successfully"}
