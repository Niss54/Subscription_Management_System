import pytest

def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

def test_password_complexity_rejected(client):
    """AC-1.1: Password <= 8 chars or missing special char/uppercase fails with 422."""
    # Too short
    res = client.post("/auth/register", json={
        "email": "bad1@test.com",
        "password": "Short1!",
        "full_name": "Bad User"
    })
    assert res.status_code == 422

    # Missing special character
    res = client.post("/auth/register", json={
        "email": "bad2@test.com",
        "password": "Password1234",
        "full_name": "Bad User"
    })
    assert res.status_code == 422

    # Missing uppercase
    res = client.post("/auth/register", json={
        "email": "bad3@test.com",
        "password": "password@123",
        "full_name": "Bad User"
    })
    assert res.status_code == 422

def test_customer_registration_and_login(client):
    """Successful registration with valid strong password returns JWT token."""
    res = client.post("/auth/register", json={
        "email": "valid_user@test.com",
        "password": "Valid@Password2026!",
        "full_name": "Valid Customer"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["role"] == "customer"

    # Login
    login_res = client.post("/auth/login", json={
        "email": "valid_user@test.com",
        "password": "Valid@Password2026!"
    })
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

def test_rbac_staff_creation(client, admin_token, customer_token):
    """AC-1.2: Only admin can add staff. Customer gets 403 Forbidden."""
    # Customer attempts to create staff -> 403 Forbidden
    res = client.post(
        "/auth/staff",
        json={
            "email": "staff1@brightloop.com",
            "password": "Staff@Brightloop2026!",
            "full_name": "Support Staff"
        },
        headers={"Authorization": f"Bearer {customer_token}"}
    )
    assert res.status_code == 403

    # Admin creates staff -> 200 OK
    res_admin = client.post(
        "/auth/staff",
        json={
            "email": "staff1@brightloop.com",
            "password": "Staff@Brightloop2026!",
            "full_name": "Support Staff"
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_admin.status_code == 200
    assert res_admin.json()["role"] == "staff"

def test_product_and_brand_variant_surcharge(client, admin_token, customer_token):
    """AC-1.3: Product base 1200 + Odoo brand variant 560 extra surcharge."""
    # Admin creates product with base price 1200.00
    res = client.post(
        "/products",
        json={
            "name": "Brightloop Enterprise Suite",
            "product_type": "software",
            "base_sales_price": "1200.00",
            "cost_price": "400.00",
            "notes": "Flagship SaaS ERP platform",
            "variants": [
                {
                    "variant_name": "Standard Brand",
                    "price_extra": "0.00",
                    "sku": "BL-ERP-STD"
                },
                {
                    "variant_name": "Odoo Brand",
                    "price_extra": "560.00",
                    "sku": "BL-ERP-ODOO"
                }
            ]
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res.status_code == 200
    product = res.json()
    assert product["name"] == "Brightloop Enterprise Suite"
    assert len(product["variants"]) == 2

    # Check that Odoo variant has price_extra 560
    odoo_variant = next(v for v in product["variants"] if v["variant_name"] == "Odoo Brand")
    assert float(odoo_variant["price_extra"]) == 560.0

def test_billing_plan_creation_with_policies(client, admin_token):
    """AC-1.5: Plan creation with recurrence frequencies and policy flags."""
    res = client.post(
        "/plans",
        json={
            "name": "Pro Annual Plan",
            "interval_unit": "yearly",
            "interval_count": 1,
            "min_quantity": 5,
            "auto_close_at_end": False,
            "allow_pause": True,
            "allow_early_close": True,
            "allow_renew": True
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res.status_code == 200
    plan = res.json()
    assert plan["interval_unit"] == "yearly"
    assert plan["min_quantity"] == 5
    assert plan["allow_pause"] is True

def test_password_reset_flow(client):
    """AC-1.4: Password reset token flow."""
    # Register user
    client.post("/auth/register", json={
        "email": "reset_test@test.com",
        "password": "Initial@Password2026!",
        "full_name": "Reset Test User"
    })

    # Request reset token
    req_res = client.post("/auth/forgot-password", json={"email": "reset_test@test.com"})
    assert req_res.status_code == 200
    token = req_res.json()["reset_token"]

    # Reset password
    reset_res = client.post("/auth/reset-password", json={
        "token": token,
        "new_password": "New@Password2026!"
    })
    assert reset_res.status_code == 200

    # Token cannot be reused (single-use)
    reuse_res = client.post("/auth/reset-password", json={
        "token": token,
        "new_password": "Another@Password2026!"
    })
    assert reuse_res.status_code == 400
