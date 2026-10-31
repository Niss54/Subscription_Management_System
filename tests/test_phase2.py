import pytest
from datetime import date, timedelta
from decimal import Decimal
from fastapi.testclient import TestClient

def test_phase2_health(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["phase"] == "Phase 2: Core Commercial Billing Engine"

def test_quotation_template_to_subscription(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a Billing Plan
    plan_res = client.post("/plans", headers=headers, json={
        "name": "Standard Monthly Enterprise",
        "interval_unit": "monthly",
        "interval_count": 1,
        "min_quantity": 1,
        "allow_pause": True,
        "allow_early_close": True,
        "allow_renew": True
    })
    assert plan_res.status_code in (200, 201)
    plan_id = plan_res.json()["id"]

    # 2. Create a Product & Variant
    prod_res = client.post("/products", headers=headers, json={
        "name": "Core Enterprise Suite",
        "product_type": "software",
        "base_sales_price": "1000.00",
        "cost_price": "300.00",
        "notes": "Main ERP module",
        "variants": [{
            "variant_name": "Brand: Odoo",
            "price_extra": "560.00",
            "sku": "CORE-ERP-ODOO-01"
        }]
    })
    assert prod_res.status_code in (200, 201)
    variant_id = prod_res.json()["variants"][0]["id"]

    # 3. Create a Quotation Template
    tpl_res = client.post("/quotation-templates", headers=headers, json={
        "name": "Default Enterprise Onboarding",
        "plan_id": plan_id,
        "validity_days": 15,
        "payment_terms": "Net 30",
        "lines": [{
            "variant_id": variant_id,
            "default_quantity": "2.0000"
        }]
    })
    assert tpl_res.status_code in (200, 201)
    template_id = tpl_res.json()["id"]

    # 4. Register a Customer
    cust_res = client.post("/auth/register", json={
        "email": "customer_acme@example.com",
        "password": "SecurePassword123!",
        "full_name": "ACME Corp Contact"
    })
    assert cust_res.status_code in (200, 201)
    customer_id = cust_res.json()["id"]

    # 5. Create Subscription From Template
    sub_res = client.post("/subscriptions/from-template", headers=headers, json={
        "customer_id": customer_id,
        "template_id": template_id
    })
    assert sub_res.status_code == 201
    sub_data = sub_res.json()
    assert "SUB-" in sub_data["subscription_number"]
    assert sub_data["state"] == "draft"
    assert len(sub_data["lines"]) == 1
    # Unit price = 1000 + 560 = 1560
    assert float(sub_data["lines"][0]["unit_price"]) == 1560.00

def test_quotation_expiry_guard(client: TestClient, admin_token: str, db_session):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Setup plan & customer
    plan_id = client.post("/plans", headers=headers, json={
        "name": "Yearly Plan", "interval_unit": "yearly", "interval_count": 1, "min_quantity": 1
    }).json()["id"]

    cust_id = client.post("/auth/register", json={
        "email": "expired_quote_cust@example.com", "password": "Password123!", "full_name": "Test User"
    }).json()["id"]

    prod = client.post("/products", headers=headers, json={
        "name": "Standalone Software", "product_type": "software", "base_sales_price": "500.00", "cost_price": "100.00",
        "variants": [{"variant_name": "Standard", "price_extra": "0.00", "sku": "STD-01"}]
    }).json()
    variant_id = prod["variants"][0]["id"]

    # Create subscription
    sub = client.post("/subscriptions", headers=headers, json={
        "customer_id": cust_id, "plan_id": plan_id,
        "lines": [{"variant_id": variant_id, "quantity": "1.0000"}]
    }).json()
    sub_id = sub["id"]

    # Transition to quotation
    q_res = client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "quotation"})
    assert q_res.status_code == 200

    # Manually backdate expiry_date to simulate expiration
    from app.models import Subscription
    sub_db = db_session.query(Subscription).filter(Subscription.id == sub_id).first()
    sub_db.expiry_date = date.today() - timedelta(days=5)
    db_session.commit()

    # Attempt transition to confirmed -> GUARD MUST REJECT!
    conf_res = client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "confirmed"})
    assert conf_res.status_code == 422
    assert "expired" in conf_res.json()["detail"].lower()

def test_plan_pause_guard(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create plan that strictly PROHIBITS pausing
    plan_id = client.post("/plans", headers=headers, json={
        "name": "Strict Non-Pausable Plan",
        "interval_unit": "monthly",
        "interval_count": 1,
        "min_quantity": 1,
        "allow_pause": False
    }).json()["id"]

    cust_id = client.post("/auth/register", json={
        "email": "nopause_cust@example.com", "password": "Password123!", "full_name": "No Pause Cust"
    }).json()["id"]

    prod = client.post("/products", headers=headers, json={
        "name": "Service Plan", "product_type": "service", "base_sales_price": "200.00", "cost_price": "50.00",
        "variants": [{"variant_name": "Basic", "price_extra": "0.00", "sku": "SRV-01"}]
    }).json()
    variant_id = prod["variants"][0]["id"]

    sub = client.post("/subscriptions", headers=headers, json={
        "customer_id": cust_id, "plan_id": plan_id,
        "lines": [{"variant_id": variant_id, "quantity": "1.0000"}]
    }).json()
    sub_id = sub["id"]

    # Move draft -> quotation -> confirmed -> active
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "quotation"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "confirmed"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "active"})

    # Attempt to PAUSE -> MUST BE REJECTED by Plan Policy!
    pause_res = client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "paused"})
    assert pause_res.status_code == 400
    assert "does not permit pausing" in pause_res.json()["detail"]

def test_mass_billing_idempotency_zero_double_billing(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Setup active subscription due today
    plan_id = client.post("/plans", headers=headers, json={
        "name": "Daily Daily Plan", "interval_unit": "daily", "interval_count": 1, "min_quantity": 1
    }).json()["id"]

    cust_id = client.post("/auth/register", json={
        "email": "daily_cust@example.com", "password": "Password123!", "full_name": "Daily User"
    }).json()["id"]

    prod = client.post("/products", headers=headers, json={
        "name": "Daily API Feed", "product_type": "software", "base_sales_price": "10.00", "cost_price": "2.00",
        "variants": [{"variant_name": "Raw", "price_extra": "0.00", "sku": "API-RAW-01"}]
    }).json()
    variant_id = prod["variants"][0]["id"]

    sub = client.post("/subscriptions", headers=headers, json={
        "customer_id": cust_id, "plan_id": plan_id,
        "lines": [{"variant_id": variant_id, "quantity": "5.0000"}]
    }).json()
    sub_id = sub["id"]

    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "quotation"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "confirmed"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "active"})

    # Check invoice count
    invs_before = client.get("/invoices", headers=headers).json()
    count_before = len(invs_before)

    # 1st Billing Run
    run1 = client.post("/invoices/trigger-billing-run", headers=headers)
    assert run1.status_code == 200

    invs_after_run1 = client.get("/invoices", headers=headers).json()
    count_after_run1 = len(invs_after_run1)

    # 2nd Billing Run immediately after (Simulating duplicate cron or double-click)
    run2 = client.post("/invoices/trigger-billing-run", headers=headers)
    assert run2.status_code == 200

    invs_after_run2 = client.get("/invoices", headers=headers).json()
    count_after_run2 = len(invs_after_run2)

    # ZERO DOUBLE BILLING: Count must not increase on second run!
    assert count_after_run2 == count_after_run1

def test_dynamic_discount_and_tax_ordering(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a 10% discount rule
    disc_res = client.post("/discounts", headers=headers, json={
        "code": "PROMO10",
        "discount_type": "percentage",
        "discount_value": "10.00",
        "max_uses": 5,
        "scope": "subscription"
    })
    assert disc_res.status_code == 201

    # 2. Setup subscription with 18% tax line
    plan_id = client.post("/plans", headers=headers, json={
        "name": "Taxed Monthly Plan", "interval_unit": "monthly", "interval_count": 1, "min_quantity": 1
    }).json()["id"]

    cust_id = client.post("/auth/register", json={
        "email": "tax_cust@example.com", "password": "Password123!", "full_name": "Tax Cust"
    }).json()["id"]

    prod = client.post("/products", headers=headers, json={
        "name": "Taxable Suite", "product_type": "software", "base_sales_price": "1000.00", "cost_price": "200.00",
        "variants": [{"variant_name": "Pro", "price_extra": "0.00", "sku": "TAX-PRO-01"}]
    }).json()
    variant_id = prod["variants"][0]["id"]

    sub = client.post("/subscriptions", headers=headers, json={
        "customer_id": cust_id, "plan_id": plan_id,
        "lines": [{"variant_id": variant_id, "quantity": "1.0000", "tax_rate": "18.00"}]
    }).json()
    sub_id = sub["id"]

    # 3. Apply Discount to Subscription
    apply_res = client.post(f"/discounts/subscriptions/{sub_id}/apply", headers=headers, json={
        "discount_code": "PROMO10"
    })
    assert apply_res.status_code == 200

    # 4. Activate subscription to trigger invoice generation
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "quotation"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "confirmed"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "active"})

    # 5. Check invoice calculations
    invs = client.get("/invoices", headers=headers).json()
    sub_inv = next(i for i in invs if i["subscription_id"] == sub_id)

    # Gross = 1000.00, Discount = 100.00, Taxable Base = 900.00, Tax (18%) = 162.00, Total = 1062.00
    assert float(sub_inv["amount_untaxed"]) == 1000.00
    assert float(sub_inv["amount_discount"]) == 100.00
    assert float(sub_inv["amount_tax"]) == 162.00
    assert float(sub_inv["amount_total"]) == 1062.00

def test_invoice_actions(client: TestClient, admin_token: str):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Setup dedicated subscription & generate invoice
    plan_id = client.post("/plans", headers=headers, json={
        "name": "Invoice Actions Plan", "interval_unit": "monthly", "interval_count": 1, "min_quantity": 1
    }).json()["id"]

    cust_res = client.post("/auth/register", json={
        "email": "inv_actions_cust@example.com", "password": "Password123!", "full_name": "Invoice Cust"
    }).json()
    cust_id = cust_res["id"]

    prod = client.post("/products", headers=headers, json={
        "name": "Invoice Action Product", "product_type": "software", "base_sales_price": "50.00", "cost_price": "10.00",
        "variants": [{"variant_name": "Standard", "price_extra": "0.00", "sku": "INV-ACT-01"}]
    }).json()
    variant_id = prod["variants"][0]["id"]

    sub_res = client.post("/subscriptions", headers=headers, json={
        "customer_id": cust_id,
        "plan_id": plan_id,
        "start_date": str(date.today()),
        "lines": [{"variant_id": variant_id, "quantity": "1.0000"}]
    })
    sub_id = sub_res.json()["id"]
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "quotation"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "confirmed"})
    client.post(f"/subscriptions/{sub_id}/transition", headers=headers, json={"target_state": "active"})

    # Fetch generated draft invoice
    invs = client.get("/invoices", headers=headers).json()
    draft_inv = next(i for i in invs if i["subscription_id"] == sub_id)
    inv_id = draft_inv["id"]

    # 1. Confirm Invoice
    conf_res = client.post(f"/invoices/{inv_id}/confirm", headers=headers)
    assert conf_res.status_code == 200
    assert conf_res.json()["status"] == "confirmed"

    # 2. Send Invoice
    send_res = client.post(f"/invoices/{inv_id}/send", headers=headers)
    assert send_res.status_code == 200
    assert "dispatched" in send_res.json()["message"]

    # 3. Print Invoice (HTML)
    print_res = client.get(f"/invoices/{inv_id}/print", headers=headers)
    assert print_res.status_code == 200
    assert "text/html" in print_res.headers["content-type"]
    assert "Brightloop Software" in print_res.text
    assert draft_inv["invoice_number"] in print_res.text

    # 4. Cancel Invoice
    cancel_res = client.post(f"/invoices/{inv_id}/cancel", headers=headers)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"
