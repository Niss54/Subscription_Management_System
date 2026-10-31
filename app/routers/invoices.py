from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, Invoice, InvoiceStatus, Payment, CreditNote
from app.schemas import InvoiceOut, BillingRunResult, CreditNoteCreate, CreditNoteOut
from app.auth import get_current_user, require_admin_or_staff, require_admin
from app.services.billing import run_billing_cycle
from app.services.discount import record_discount_usage_atomic

router = APIRouter(prefix="/invoices", tags=["invoices"])

@router.get("", response_model=List[InvoiceOut])
def list_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role in [UserRole.admin, UserRole.staff]:
        return db.query(Invoice).all()
    else:
        return db.query(Invoice).filter(Invoice.customer_id == current_user.id).all()

@router.get("/{id}", response_model=InvoiceOut)
def get_invoice(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if current_user.role == UserRole.customer and inv.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return inv

@router.post("/{id}/confirm", response_model=InvoiceOut)
def confirm_invoice(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status != InvoiceStatus.draft:
        raise HTTPException(status_code=400, detail=f"Cannot confirm invoice in state {inv.status}")

    inv.status = InvoiceStatus.confirmed

    # Atomic decrement of discount usage if discount was applied
    for disc in inv.subscription.discounts:
        record_discount_usage_atomic(db, disc.discount_rule_id)

    db.commit()
    db.refresh(inv)
    return inv

@router.post("/{id}/cancel", response_model=InvoiceOut)
def cancel_invoice(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Guard: cannot cancel if payments are recorded
    payment_count = db.query(Payment).filter(Payment.invoice_id == id).count()
    if payment_count > 0:
        raise HTTPException(status_code=400, detail="Cannot cancel invoice with recorded payments")

    inv.status = InvoiceStatus.cancelled
    db.commit()
    db.refresh(inv)
    return inv

@router.post("/{id}/send", status_code=status.HTTP_200_OK)
def send_invoice(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return {
        "status": "success",
        "message": f"Invoice {inv.invoice_number} dispatched to customer {inv.customer.email}",
        "recipient": inv.customer.email,
        "amount": str(inv.amount_total)
    }

@router.get("/{id}/print", response_class=HTMLResponse)
def print_invoice(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if current_user.role == UserRole.customer and inv.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    lines_html = ""
    for line in inv.lines:
        lines_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{line.description}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">{line.quantity}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${line.unit_price:.2f}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">{line.tax_rate}%</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${line.discount_amount:.2f}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${line.line_subtotal:.2f}</td>
        </tr>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Invoice {inv.invoice_number} — Brightloop Software</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 40px; background: #fff; }}
            .header {{ display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: bold; color: #0284c7; }}
            .meta {{ text-align: right; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 30px; }}
            th {{ background: #f8fafc; padding: 10px; text-align: left; font-size: 13px; color: #64748b; }}
            .totals {{ margin-top: 20px; margin-left: auto; width: 300px; }}
            .totals-row {{ display: flex; justify-content: space-between; padding: 6px 0; }}
            .totals-grand {{ font-size: 18px; font-weight: bold; border-top: 2px solid #0f172a; padding-top: 10px; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; }}
            .status-draft {{ background: #f1f5f9; color: #475569; }}
            .status-confirmed {{ background: #e0f2fe; color: #0369a1; }}
            .status-paid {{ background: #dcfce7; color: #15803d; }}
        </style>
    </head>
    <body>
        <div class="header">
            <div>
                <div class="logo">⚡ Brightloop Software</div>
                <div>Recurring Subscription Billing</div>
                <div>support@brightloop.com</div>
            </div>
            <div class="meta">
                <h2>INVOICE</h2>
                <div><strong>Invoice #:</strong> {inv.invoice_number}</div>
                <div><strong>Date:</strong> {inv.invoice_date}</div>
                <div><strong>Due Date:</strong> {inv.due_date}</div>
                <div><strong>Status:</strong> <span class="badge status-{inv.status}">{inv.status}</span></div>
            </div>
        </div>

        <div style="margin-top: 30px;">
            <strong>Billed To:</strong>
            <div>{inv.customer.full_name}</div>
            <div>{inv.customer.email}</div>
            <div>Subscription Ref: {inv.subscription.subscription_number}</div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Item Description</th>
                    <th style="text-align: right;">Qty</th>
                    <th style="text-align: right;">Unit Price</th>
                    <th style="text-align: right;">Tax Rate</th>
                    <th style="text-align: right;">Discount</th>
                    <th style="text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>
                {lines_html}
            </tbody>
        </table>

        <div class="totals">
            <div class="totals-row"><span>Untaxed Subtotal:</span><span>${inv.amount_untaxed:.2f}</span></div>
            <div class="totals-row" style="color: #059669;"><span>Total Discount:</span><span>-${inv.amount_discount:.2f}</span></div>
            <div class="totals-row"><span>Taxes:</span><span>${inv.amount_tax:.2f}</span></div>
            <div class="totals-row totals-grand"><span>Total Amount Due:</span><span>${inv.amount_total:.2f}</span></div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

@router.post("/trigger-billing-run", response_model=BillingRunResult)
@router.post("/run-billing-cycle", response_model=BillingRunResult)
def trigger_billing_run(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    result = run_billing_cycle(db, target_date or date.today())
    return result


# ─────────────── CREDIT NOTES (LAGO / KILL BILL PATTERN) ───────────────

@router.post("/{id}/credit-notes", response_model=CreditNoteOut, status_code=status.HTTP_201_CREATED)
def issue_credit_note(
    id: str,
    payload: CreditNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status not in [InvoiceStatus.confirmed, InvoiceStatus.paid]:
        raise HTTPException(status_code=400, detail="Credit notes can only be issued against confirmed or paid invoices")
    if payload.amount <= 0 or payload.amount > inv.amount_total:
        raise HTTPException(status_code=400, detail="Credit note amount must be positive and cannot exceed invoice total")

    cn_count = db.query(CreditNote).count() + 1
    cn_number = f"CN-{inv.invoice_number.replace('INV-', '')}-{cn_count:02d}"

    credit_note = CreditNote(
        credit_note_number=cn_number,
        invoice_id=inv.id,
        customer_id=inv.customer_id,
        amount=payload.amount,
        reason=payload.reason,
        refund_status="succeeded",
        notes=payload.notes
    )
    db.add(credit_note)
    db.commit()
    db.refresh(credit_note)
    return credit_note


@router.get("/{id}/credit-notes", response_model=List[CreditNoteOut])
def list_invoice_credit_notes(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if current_user.role == UserRole.customer and inv.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return db.query(CreditNote).filter(CreditNote.invoice_id == id).all()


