import pytest
from decimal import Decimal

from app.models import User, UserRole, BillingPlan, Product, ProductVariant, BillingInterval, Subscription, Invoice, InvoiceStatus

def test_google_oauth_callback(client):
    """Verify Supabase Google OAuth callback creates user and returns JWT token."""
    payload = {
        "email": "google_test_user@gmail.com",
        "full_name": "Google Test User"
    }
    res = client.post("/auth/google-callback", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["email"] == "google_test_user@gmail.com"
    assert data["role"] == "customer"


def test_razorpay_order_creation_and_due_amount(client, admin_token):
    """Verify Razorpay order creation creates official order payload with accurate paise amount."""
    auth_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Register customer
    cust_res = client.post("/auth/register", json={
        "email": "razorpay_payer@brightloop.com",
        "password": "StrongPassword123!",
        "full_name": "Razorpay Customer"
    })
    cust_id = cust_res.json()["user_id"]
    cust_token = cust_res.json()["access_token"]
    cust_headers = {"Authorization": f"Bearer {cust_token}"}

    # 2. Create product & variant
    prod_res = client.post("/products", json={
        "name": "Cloud Enterprise Pro",
        "product_type": "software",
        "base_sales_price": "499.00",
        "cost_price": "100.00",
        "variants": [
            {"variant_name": "Default Edition", "price_extra": "0.00", "sku": "BL-CLOUD-499"}
        ]
    }, headers=auth_headers)
    assert prod_res.status_code == 200
    prod_data = prod_res.json()
    var_id = prod_data["variants"][0]["id"]

    # 3. Create billing plan (daily interval so next_billing_date is immediately due today)
    plan_res = client.post("/plans", json={
        "name": "Cloud Pro Daily",
        "interval_unit": "daily",
        "interval_count": 1,
        "min_quantity": 1,
        "allow_pause": True
    }, headers=auth_headers)
    assert plan_res.status_code in (200, 201)
    plan_id = plan_res.json()["id"]

    # 4. Create subscription
    sub_res = client.post("/subscriptions", json={
        "customer_id": cust_id,
        "plan_id": plan_id,
        "lines": [{"variant_id": var_id, "quantity": 1, "unit_price": 499.00}]
    }, headers=auth_headers)
    assert sub_res.status_code in (200, 201)
    sub_id = sub_res.json()["id"]

    # Transition subscription through valid state machine: draft -> quotation -> confirmed -> active
    client.post(f"/subscriptions/{sub_id}/transition", headers=auth_headers, json={"target_state": "quotation"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=auth_headers, json={"target_state": "confirmed"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=auth_headers, json={"target_state": "active"})

    # Run billing to generate invoice
    run_res = client.post("/invoices/trigger-billing-run", headers=auth_headers)
    assert run_res.status_code == 200

    invoices = client.get("/invoices", headers=auth_headers).json()
    target_inv = next(i for i in invoices if i["customer_id"] == cust_id)
    inv_id = target_inv["id"]

    # Confirm invoice so it is ready for payment
    client.post(f"/invoices/{inv_id}/confirm", headers=auth_headers)

    # 5. Customer creates Razorpay Order
    order_res = client.post("/payments/razorpay/create-order", json={"invoice_id": inv_id}, headers=cust_headers)
    assert order_res.status_code == 200
    order_data = order_res.json()
    assert "order_id" in order_data
    assert order_data["currency"] == "INR"
    assert order_data["amount_paise"] == 49900  # $499.00 = 49900 paise
    assert order_data["invoice_id"] == inv_id


def test_bulk_notification_and_overdue_blast(client, admin_token):
    """Verify email notification engine dispatches reminders to overdue customers and staff."""
    auth_headers = {"Authorization": f"Bearer {admin_token}"}

    # Test overdue blast
    blast_res = client.post("/notifications/overdue-blast", headers=auth_headers)
    assert blast_res.status_code == 200
    blast_data = blast_res.json()
    assert blast_data["success"] is True
    assert "dispatched_count" in blast_data

    # Test staff alert notification
    staff_alert_res = client.post("/notifications/send-bulk", json={
        "target_group": "staff",
        "subject": "System Maintenance Scheduled",
        "body_message": "All staff please review pending subscriptions before midnight."
    }, headers=auth_headers)
    assert staff_alert_res.status_code == 200
    staff_data = staff_alert_res.json()
    assert staff_data["success"] is True
    assert len(staff_data["recipients"]) >= 1
