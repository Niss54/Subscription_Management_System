from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date
from typing import List
from decimal import Decimal

from app.database import get_db
from app.models import User, UserRole, Invoice, InvoiceStatus
from app.schemas import EmailNotificationRequest, EmailNotificationResponse
from app.auth import get_current_user, require_admin_or_staff
from app.services.email import email_service

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.post("/send-bulk", response_model=EmailNotificationResponse)
def send_bulk_notification(
    payload: EmailNotificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    """
    Enterprise communication engine:
    Dispatches targeted emails to overdue customers, all customers, staff, or custom list.
    """
    recipients = []
    today = date.today()

    if payload.target_group == "overdue_customers":
        overdue_invoices = db.query(Invoice).filter(
            Invoice.status == InvoiceStatus.confirmed,
            Invoice.due_date < today
        ).all()
        for inv in overdue_invoices:
            if inv.customer and inv.customer.email:
                if inv.customer.email not in recipients:
                    recipients.append(inv.customer.email)
                    due = inv.amount_total - (inv.amount_paid or Decimal("0.0000"))
                    html = email_service.render_invoice_reminder_template(
                        customer_name=inv.customer.full_name or "Valued Customer",
                        invoice_number=inv.invoice_number,
                        amount_due=f"{due:.2f}",
                        due_date=str(inv.due_date)
                    )
                    email_service.send_email(
                        to_email=inv.customer.email,
                        subject=f"Urgent: Payment Reminder for {inv.invoice_number}",
                        html_content=html,
                        text_content=payload.body_message
                    )

    elif payload.target_group == "all_customers":
        customers = db.query(User).filter(User.role == UserRole.customer, User.is_active == True).all()
        for c in customers:
            if c.email and c.email not in recipients:
                recipients.append(c.email)
                email_service.send_email(
                    to_email=c.email,
                    subject=payload.subject,
                    html_content=f"<div style='font-family:sans-serif;'><h3>{payload.subject}</h3><p>{payload.body_message}</p></div>",
                    text_content=payload.body_message
                )

    elif payload.target_group == "staff":
        staff_members = db.query(User).filter(
            User.role.in_([UserRole.staff, UserRole.admin]),
            User.is_active == True
        ).all()
        for s in staff_members:
            if s.email and s.email not in recipients:
                recipients.append(s.email)
                html = email_service.render_staff_alert_template(
                    staff_name=s.full_name or "Team Member",
                    alert_title=payload.subject,
                    alert_details=payload.body_message
                )
                email_service.send_email(
                    to_email=s.email,
                    subject=f"[Brightloop Staff Alert] {payload.subject}",
                    html_content=html,
                    text_content=payload.body_message
                )

    elif payload.target_group == "custom":
        if not payload.custom_recipients:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="custom_recipients list is required when target_group is 'custom'"
            )
        for email in payload.custom_recipients:
            recipients.append(str(email))
            email_service.send_email(
                to_email=str(email),
                subject=payload.subject,
                html_content=f"<div style='font-family:sans-serif;'><h3>{payload.subject}</h3><p>{payload.body_message}</p></div>",
                text_content=payload.body_message
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown target_group '{payload.target_group}'. Allowed: overdue_customers, all_customers, staff, custom"
        )

    return EmailNotificationResponse(
        success=True,
        dispatched_count=len(recipients),
        target_group=payload.target_group,
        recipients=recipients,
        subject=payload.subject,
        message=f"Successfully queued and dispatched notifications to {len(recipients)} recipient(s)."
    )


@router.post("/overdue-blast", response_model=EmailNotificationResponse)
def trigger_overdue_blast(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    """1-Click shortcut to blast payment reminders to all overdue customer accounts."""
    req = EmailNotificationRequest(
        target_group="overdue_customers",
        subject="Brightloop Payment Overdue Reminder",
        body_message="Your invoice is overdue. Please settle your outstanding balance via the portal."
    )
    return send_bulk_notification(payload=req, db=db, current_user=current_user)
