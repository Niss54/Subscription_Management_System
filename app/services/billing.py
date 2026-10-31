import hashlib
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import (
    Subscription, SubscriptionState, BillingInterval,
    Invoice, InvoiceStatus, InvoiceLine, TaxRule
)
from app.services.discount import get_valid_subscription_discounts, calculate_discounts_and_taxes

def generate_idempotency_key(subscription_id: str, period_start: date, period_end: date) -> str:
    """Generates deterministic SHA-256 idempotency key for exact billing period window."""
    raw = f"{subscription_id}:{period_start.isoformat()}:{period_end.isoformat()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def advance_billing_date(start: date, interval_unit: BillingInterval, interval_count: int) -> date:
    """
    Calculates next billing date based on recurrence interval.
    Safe across month boundaries.
    """
    if interval_unit == BillingInterval.daily:
        return start + timedelta(days=interval_count)
    elif interval_unit == BillingInterval.weekly:
        return start + timedelta(weeks=interval_count)
    elif interval_unit == BillingInterval.monthly:
        # Month advance algorithm
        month = start.month - 1 + interval_count
        year = start.year + month // 12
        month = month % 12 + 1
        day = min(start.day, [31,
            29 if year % 4 == 0 and not (year % 100 == 0 and year % 400 != 0) else 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        return date(year, month, day)
    elif interval_unit == BillingInterval.yearly:
        try:
            return start.replace(year=start.year + interval_count)
        except ValueError:
            # Leap year Feb 29 to Feb 28
            return start.replace(year=start.year + interval_count, day=28)
    return start + timedelta(days=30)

def generate_invoice_number(db: Session) -> str:
    """Generates unique sequential invoice number (e.g. INV-2026-0001)."""
    current_year = date.today().year
    prefix = f"INV-{current_year}-"
    count = db.query(Invoice).filter(Invoice.invoice_number.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"

def generate_invoice_for_subscription(
    db: Session,
    subscription: Subscription,
    run_date: date,
    due_days: int = 15
) -> Optional[Invoice]:
    """
    Creates a single invoice for a due active subscription.
    Guarantees strict idempotency: if an invoice for this cycle exists, returns None.
    """
    period_start = subscription.next_invoice_date or run_date
    plan = subscription.plan
    period_end = advance_billing_date(period_start, plan.interval_unit, plan.interval_count)

    idempotency_key = generate_idempotency_key(subscription.id, period_start, period_end)

    # 1. Idempotency Check
    existing_invoice = db.query(Invoice).filter(Invoice.idempotency_key == idempotency_key).first()
    if existing_invoice:
        return None  # Already billed for this period! Zero double-billing.

    # 2. Get applicable discounts
    discounts = get_valid_subscription_discounts(db, subscription.id, run_date)

    # 3. Calculate taxes and line breakdowns
    untaxed, discount_val, tax_val, total_val, line_breakdowns = calculate_discounts_and_taxes(
        db, subscription.lines, discounts
    )

    due_date = run_date + timedelta(days=due_days)
    invoice_number = generate_invoice_number(db)

    # 4. Create Invoice Header
    invoice = Invoice(
        invoice_number=invoice_number,
        subscription_id=subscription.id,
        customer_id=subscription.customer_id,
        status=InvoiceStatus.draft,
        invoice_date=run_date,
        due_date=due_date,
        billing_period_start=period_start,
        billing_period_end=period_end,
        amount_untaxed=untaxed,
        amount_discount=discount_val,
        amount_tax=tax_val,
        amount_total=total_val,
        amount_paid=Decimal("0.0000"),
        idempotency_key=idempotency_key
    )
    db.add(invoice)
    db.flush()

    # 5. Create Invoice Line Items
    for item in line_breakdowns:
        line_item = InvoiceLine(
            invoice_id=invoice.id,
            variant_id=item["line"].variant_id,
            description=f"{item['line'].variant.product.name} ({item['line'].variant.variant_name})",
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            tax_rate=item["tax_rate"],
            discount_amount=item["discount_allocated"],
            line_subtotal=item["line_total"]
        )
        db.add(line_item)

    # 6. Advance Subscription next_invoice_date
    subscription.next_invoice_date = period_end

    # 7. Auto-Close check if plan configured
    if plan.auto_close_at_end and subscription.expiry_date and period_end >= subscription.expiry_date:
        subscription.state = SubscriptionState.closed

    db.commit()
    db.refresh(invoice)
    return invoice

def run_billing_cycle(db: Session, run_date: Optional[date] = None) -> dict:
    """
    Mass billing runner for Billing Day.
    Finds all active subscriptions where next_invoice_date <= run_date.
    """
    if run_date is None:
        run_date = date.today()

    due_subscriptions = (
        db.query(Subscription)
        .filter(
            Subscription.state == SubscriptionState.active,
            Subscription.next_invoice_date <= run_date
        )
        .all()
    )

    processed_count = len(due_subscriptions)
    invoices_generated = 0
    skipped_count = 0
    errors = []

    for sub in due_subscriptions:
        try:
            inv = generate_invoice_for_subscription(db, sub, run_date)
            if inv:
                invoices_generated += 1
            else:
                skipped_count += 1
        except Exception as e:
            errors.append(f"Subscription {sub.subscription_number}: {str(e)}")

    return {
        "processed_count": processed_count,
        "invoices_generated": invoices_generated,
        "skipped_count": skipped_count,
        "errors": errors
    }
