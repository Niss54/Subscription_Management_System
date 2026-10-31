"""
Payment recording & reconciliation.
Invariants Enforced:
1. Reconciles payment against specific confirmed invoice.
2. Supports partial payments (tracks amount_paid vs amount_total).
3. Automatically transitions invoice to 'paid' when full amount is settled.
4. Rejects payments against draft or cancelled invoices.
5. Rejects non-positive payment amounts.
6. Multi-tenant isolation: customers can view and pay only their own invoices.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal

from app.database import get_db
from app.models import Payment, Invoice, InvoiceStatus, User, PaymentMethodEnum
from app.schemas import PaymentCreate, PaymentOut
from app.auth import require_admin_or_staff, get_current_user

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def record_payment(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.value == "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customers cannot record payments manually. Use customer portal payment endpoint."
        )

    invoice = db.query(Invoice).filter(Invoice.id == str(payload.invoice_id)).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    if invoice.status == InvoiceStatus.cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot record payment against a cancelled invoice")
    if invoice.status == InvoiceStatus.paid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invoice is already fully paid")
    if invoice.status == InvoiceStatus.draft:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot pay a draft invoice — confirm it first")
    if payload.amount <= Decimal("0"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment amount must be greater than zero")

    payment = Payment(
        invoice_id=invoice.id,
        payment_method=payload.payment_method,
        amount=payload.amount,
        reference_note=payload.reference_note,
        recorded_by=current_user.id
    )
    db.add(payment)

    current_paid = invoice.amount_paid or Decimal("0.0000")
    new_paid = current_paid + payload.amount
    invoice.amount_paid = new_paid

    if new_paid >= invoice.amount_total:
        invoice.status = InvoiceStatus.paid

    db.commit()
    db.refresh(payment)
    return payment


@router.post("/checkout", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def customer_self_checkout(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Customer self-service online checkout (Stripe/UPI/Card simulation)."""
    invoice = db.query(Invoice).filter(
        Invoice.id == str(payload.invoice_id),
        Invoice.customer_id == current_user.id
    ).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found or does not belong to you")
    if invoice.status == InvoiceStatus.cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot record payment against a cancelled invoice")
    if invoice.status == InvoiceStatus.paid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invoice is already fully paid")
    if invoice.status == InvoiceStatus.draft:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot pay a draft invoice — confirm it first")
    if payload.amount <= Decimal("0"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment amount must be greater than zero")

    payment = Payment(
        invoice_id=invoice.id,
        payment_method=payload.payment_method,
        amount=payload.amount,
        reference_note=payload.reference_note or "Customer Online Checkout",
        recorded_by=current_user.id
    )
    db.add(payment)

    current_paid = invoice.amount_paid or Decimal("0.0000")
    new_paid = current_paid + payload.amount
    invoice.amount_paid = new_paid

    if new_paid >= invoice.amount_total:
        invoice.status = InvoiceStatus.paid

    db.commit()
    db.refresh(payment)
    return payment


@router.get("", response_model=List[PaymentOut])
def list_payments(
    invoice_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Payment)
    if current_user.role.value == "customer":
        query = query.join(Invoice).filter(Invoice.customer_id == current_user.id)
    if invoice_id:
        query = query.filter(Payment.invoice_id == invoice_id)
    return query.order_by(Payment.created_at.desc()).all()
