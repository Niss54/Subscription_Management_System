import time
from datetime import date, timedelta
from decimal import Decimal
import pytest

from app.models import (
    Invoice,
    InvoiceStatus,
    Subscription,
    SubscriptionState,
    BillingPlan,
    BillingInterval,
    Product,
    ProductVariant,
    SubscriptionLine,
    User,
    UserRole
)
from app.auth import get_password_hash, create_access_token


def test_phase3_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert "Phase 3" in res.json()["phase"]


def test_payment_partial_settlement_and_auto_paid_status(client, db_session, admin_token, customer_user):
    """
    GRAVITAS INVARIANT:
    1. Invoice status is 'confirmed'.
    2. Partial payment leaves status as 'confirmed' and increments amount_paid.
    3. Final payment meeting/exceeding amount_total automatically sets status to 'paid'.
    """
    # 1. Setup subscription and confirmed invoice
    plan = BillingPlan(
        name="Payment Test Plan",
        interval_unit=BillingInterval.monthly,
        interval_count=1,
        min_quantity=1
    )
    db_session.add(plan)
    db_session.flush()

    sub = Subscription(
        subscription_number="SUB-PAY-001",
        customer_id=customer_user.id,
        plan_id=plan.id,
        state=SubscriptionState.active,
        start_date=date.today(),
        next_invoice_date=date.today() + timedelta(days=30)
    )
    db_session.add(sub)
    db_session.flush()

    invoice = Invoice(
        invoice_number="INV-PAY-001",
        subscription_id=sub.id,
        customer_id=customer_user.id,
        status=InvoiceStatus.confirmed,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=15),
        billing_period_start=date.today(),
        billing_period_end=date.today() + timedelta(days=30),
        amount_untaxed=Decimal("1000.0000"),
        amount_discount=Decimal("0.0000"),
        amount_tax=Decimal("0.0000"),
        amount_total=Decimal("1000.0000"),
        amount_paid=Decimal("0.0000"),
        idempotency_key="idemp_pay_001"
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)

    # 2. Record Partial Payment: 400.00
    pay_res1 = client.post(
        "/payments",
        json={
            "invoice_id": invoice.id,
            "payment_method": "bank_transfer",
            "amount": "400.0000",
            "reference_note": "Advance milestone 40%"
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert pay_res1.status_code == 201
    db_session.refresh(invoice)
    assert invoice.amount_paid == Decimal("400.0000")
    assert invoice.status == InvoiceStatus.confirmed

    # 3. Record Remaining Payment: 600.00
    pay_res2 = client.post(
        "/payments",
        json={
            "invoice_id": invoice.id,
            "payment_method": "credit_card",
            "amount": "600.0000",
            "reference_note": "Final settlement 60%"
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert pay_res2.status_code == 201
    db_session.refresh(invoice)
    assert invoice.amount_paid == Decimal("1000.0000")
    assert invoice.status == InvoiceStatus.paid  # Automatically marked PAID!

    # 4. Attempt payment on already-paid invoice -> 400 Bad Request
    pay_res3 = client.post(
        "/payments",
        json={
            "invoice_id": invoice.id,
            "payment_method": "cash",
            "amount": "100.0000"
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert pay_res3.status_code == 400
    assert "already fully paid" in pay_res3.json()["detail"]


def test_payment_guards_draft_and_cancelled(client, db_session, admin_token, customer_user):
    """Cannot pay draft or cancelled invoices."""
    plan = db_session.query(BillingPlan).first()
    sub = Subscription(
        subscription_number="SUB-PAY-GUARD",
        customer_id=customer_user.id,
        plan_id=plan.id,
        state=SubscriptionState.draft
    )
    db_session.add(sub)
    db_session.flush()

    draft_inv = Invoice(
        invoice_number="INV-DRAFT-GUARD",
        subscription_id=sub.id,
        customer_id=customer_user.id,
        status=InvoiceStatus.draft,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=15),
        billing_period_start=date.today(),
        billing_period_end=date.today() + timedelta(days=30),
        amount_total=Decimal("500.0000"),
        amount_paid=Decimal("0.0000"),
        idempotency_key="idemp_draft_guard"
    )
    db_session.add(draft_inv)
    db_session.commit()

    # Draft invoice payment -> Rejected
    res = client.post(
        "/payments",
        json={
            "invoice_id": draft_inv.id,
            "payment_method": "upi",
            "amount": "500.0000"
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res.status_code == 400
    assert "draft" in res.json()["detail"].lower()

    # Cancelled invoice payment -> Rejected
    draft_inv.status = InvoiceStatus.cancelled
    db_session.commit()

    res_cancel = client.post(
        "/payments",
        json={
            "invoice_id": draft_inv.id,
            "payment_method": "upi",
            "amount": "500.0000"
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_cancel.status_code == 400
    assert "cancelled" in res_cancel.json()["detail"].lower()


def test_customer_portal_checkout_and_rbac(client, db_session, customer_token, customer_user, admin_token):
    """
    RBAC & Multi-tenant isolation:
    - Customer cannot call admin /payments directly (HTTP 403).
    - Customer can call /payments/checkout for their own confirmed invoice.
    - Customer cannot pay another customer's invoice.
    """
    # Create another customer
    other_user = User(
        email="victim_customer@brightloop.com",
        password_hash=get_password_hash("Victim@Pass2026!"),
        full_name="Victim Customer",
        role=UserRole.customer
    )
    db_session.add(other_user)
    db_session.flush()

    plan = db_session.query(BillingPlan).first()
    sub_other = Subscription(
        subscription_number="SUB-OTHER-001",
        customer_id=other_user.id,
        plan_id=plan.id,
        state=SubscriptionState.active
    )
    db_session.add(sub_other)
    db_session.flush()

    other_inv = Invoice(
        invoice_number="INV-OTHER-001",
        subscription_id=sub_other.id,
        customer_id=other_user.id,
        status=InvoiceStatus.confirmed,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=15),
        billing_period_start=date.today(),
        billing_period_end=date.today() + timedelta(days=30),
        amount_total=Decimal("750.0000"),
        amount_paid=Decimal("0.0000"),
        idempotency_key="idemp_other_001"
    )
    db_session.add(other_inv)
    db_session.commit()

    # 1. Customer calling staff /payments endpoint -> 403 Forbidden
    res_forbidden = client.post(
        "/payments",
        json={
            "invoice_id": other_inv.id,
            "payment_method": "upi",
            "amount": "750.0000"
        },
        headers={"Authorization": f"Bearer {customer_token}"}
    )
    assert res_forbidden.status_code == 403

    # 2. Customer attempting to pay another customer's invoice -> 404 Not Found
    res_other = client.post(
        "/payments/checkout",
        json={
            "invoice_id": other_inv.id,
            "payment_method": "credit_card",
            "amount": "750.0000"
        },
        headers={"Authorization": f"Bearer {customer_token}"}
    )
    assert res_other.status_code == 404

    # 3. Customer paying own confirmed invoice -> Success 201
    own_inv = Invoice(
        invoice_number="INV-OWN-001",
        subscription_id=sub_other.id,
        customer_id=customer_user.id,
        status=InvoiceStatus.confirmed,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=15),
        billing_period_start=date.today(),
        billing_period_end=date.today() + timedelta(days=30),
        amount_total=Decimal("350.0000"),
        amount_paid=Decimal("0.0000"),
        idempotency_key="idemp_own_001"
    )
    db_session.add(own_inv)
    db_session.commit()

    res_checkout = client.post(
        "/payments/checkout",
        json={
            "invoice_id": own_inv.id,
            "payment_method": "upi",
            "amount": "350.0000",
            "reference_note": "Self-serve UPI Instant Payment"
        },
        headers={"Authorization": f"Bearer {customer_token}"}
    )
    assert res_checkout.status_code == 201
    db_session.refresh(own_inv)
    assert own_inv.status == InvoiceStatus.paid


def test_dashboard_sla_and_financial_analytics(client, db_session, admin_token, customer_user):
    """
    GRAVITAS INVARIANT:
    1. /dashboard/summary latency must be strictly < 2000ms.
    2. MRR/ARR normalization logic matches standard SaaS accounting.
    3. Overdue aging buckets accurately classify: 1-30, 31-60, 61-90, 90+ days.
    """
    # Seed overdue invoices across different aging buckets
    today = date.today()

    plan = db_session.query(BillingPlan).first()
    sub = db_session.query(Subscription).filter(Subscription.customer_id == customer_user.id).first()

    # Product and variant for MRR check
    prod = Product(name="Enterprise Cloud", product_type="service", base_sales_price=Decimal("120.0000"), cost_price=Decimal("40.0000"))
    db_session.add(prod)
    db_session.flush()

    variant = ProductVariant(product_id=prod.id, variant_name="US-East Dedicated", price_extra=Decimal("30.0000"), sku="EC-USEAST")
    db_session.add(variant)
    db_session.flush()

    line = SubscriptionLine(subscription_id=sub.id, variant_id=variant.id, quantity=Decimal("2.0000"), unit_price=Decimal("150.0000"))
    db_session.add(line)

    # Invoices in overdue buckets
    # Bucket 1_30: due 10 days ago, total 100
    inv_10d = Invoice(
        invoice_number="INV-DUE-10D",
        subscription_id=sub.id,
        customer_id=customer_user.id,
        status=InvoiceStatus.confirmed,
        invoice_date=today - timedelta(days=25),
        due_date=today - timedelta(days=10),
        billing_period_start=today - timedelta(days=25),
        billing_period_end=today + timedelta(days=5),
        amount_total=Decimal("100.0000"),
        amount_paid=Decimal("0.0000"),
        idempotency_key="idemp_due_10d"
    )
    # Bucket 31_60: due 45 days ago, total 200
    inv_45d = Invoice(
        invoice_number="INV-DUE-45D",
        subscription_id=sub.id,
        customer_id=customer_user.id,
        status=InvoiceStatus.confirmed,
        invoice_date=today - timedelta(days=60),
        due_date=today - timedelta(days=45),
        billing_period_start=today - timedelta(days=60),
        billing_period_end=today - timedelta(days=30),
        amount_total=Decimal("200.0000"),
        amount_paid=Decimal("50.0000"),  # 150 remaining
        idempotency_key="idemp_due_45d"
    )
    # Bucket 90_plus: due 120 days ago, total 500
    inv_120d = Invoice(
        invoice_number="INV-DUE-120D",
        subscription_id=sub.id,
        customer_id=customer_user.id,
        status=InvoiceStatus.confirmed,
        invoice_date=today - timedelta(days=140),
        due_date=today - timedelta(days=120),
        billing_period_start=today - timedelta(days=140),
        billing_period_end=today - timedelta(days=110),
        amount_total=Decimal("500.0000"),
        amount_paid=Decimal("0.0000"),
        idempotency_key="idemp_due_120d"
    )

    db_session.add_all([inv_10d, inv_45d, inv_120d])
    db_session.commit()

    # Query Executive Dashboard
    t0 = time.perf_counter()
    res = client.get("/dashboard/summary", headers={"Authorization": f"Bearer {admin_token}"})
    duration = time.perf_counter() - t0

    assert res.status_code == 200
    assert duration < 2.0, f"Dashboard SLA breached! Took {duration:.4f}s"

    data = res.json()
    assert data["active_subscriptions"] >= 1
    assert data["mrr"] > 0
    assert data["arr"] == round(data["mrr"] * 12.0, 2)
    assert data["response_time_ms"] < 2000.0

    buckets = data["overdue_aging_buckets"]
    assert buckets["1_30"] >= 100.0
    assert buckets["31_60"] >= 150.0
    assert buckets["90_plus"] >= 500.0
    assert data["overdue_invoices_count"] >= 3

    # Query Plan distribution
    plan_res = client.get("/dashboard/plan-distribution", headers={"Authorization": f"Bearer {admin_token}"})
    assert plan_res.status_code == 200
    assert len(plan_res.json()) >= 1
