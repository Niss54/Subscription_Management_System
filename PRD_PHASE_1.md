# 🚀 PRD PHASE 1: System Foundation, Identity, Catalog & Billing Plans
## Brightloop Software Subscription Billing Platform (Hackathon Winning Blueprint)

> **Document Version:** 2.0.0 (Production Implementation Specification)  
> **Engineering Mode:** GRAVITAS Invariant-Enforced Implementation  
> **Target SLA:** 100% Functional Compliance with Brightloop Problem Statement  
> **Phase Scope:** Identity, RBAC, Security, Product Catalog, Brand Variants, Plan Rules, Step-by-Step Build Plan  

---

## 1. Executive Context & Phase Objective

Phase 1 establishes the rock-solid foundation for the entire Subscription Management Platform. Any failure in tenant boundary isolation, password hashing, variant price inheritance, or plan recurrence rules cascades into critical accounting and security failures later in the pipeline.

### Core Deliverables in Phase 1
1. **Cryptographically Secure Auth & RBAC:**
   - Password policy: $> 8$ characters, at least 1 uppercase, 1 lowercase, 1 special character.
   - Password hashing: **Argon2id** / **bcrypt** (cost factor 12).
   - Single-use, time-bound (15-min) password reset tokens stored as SHA-256 hashes.
   - Multi-role isolation: `admin` (super-user), `staff` (day-to-day operations), `customer` (self-service portal).
2. **Product Catalog with Dynamic Variant Surcharges:**
   - Base products with sales price, cost price, type (`software`, `service`, `addon`), and notes.
   - Variant surcharge engine: e.g., choosing brand variant `Odoo` adds **+560.00** to base price.
3. **Flexible Billing Plans with Policy Controls:**
   - Recurrence frequencies: `daily`, `weekly`, `monthly`, `yearly`.
   - Minimum seat/quantity enforcement.
   - Granular plan behavior toggles: `can_be_paused`, `can_be_renewed`, `can_be_closed_early`, `auto_close_at_end`.
   - Date-bound availability windows (`available_from`, `available_to`).
4. **Dual Database Architecture (Judge Zero-Friction Engine):**
   - Default SQLite database for instant zero-dependency execution on judge evaluation environments.
   - Production PostgreSQL compatibility with identical ORM models and schema invariants.

---

## 2. Technical Architecture & Data Models (Phase 1)

### 2.1 Entity Relationship Diagram (Phase 1 Sub-schema)

```mermaid
erDiagram
    USERS ||--o{ PASSWORD_RESET_TOKENS : "requests"
    USERS {
        uuid id PK
        string email UK "Unique, case-insensitive"
        string password_hash "bcrypt / Argon2id"
        string role "admin | staff | customer"
        string full_name
        boolean is_active
        datetime created_at
    }

    PASSWORD_RESET_TOKENS {
        uuid id PK
        uuid user_id FK
        string token_hash "SHA256 of raw secret"
        datetime expires_at "15-minute validity"
        boolean used "Single-use flag"
    }

    PRODUCTS ||--|{ PRODUCT_VARIANTS : "has"
    PRODUCTS {
        uuid id PK
        string name
        string product_type "software | service | addon"
        numeric base_sales_price "NUMERIC(16, 4)"
        numeric cost_price "NUMERIC(16, 4)"
        text notes
        datetime created_at
    }

    PRODUCT_VARIANTS {
        uuid id PK
        uuid product_id FK
        string attribute_name "e.g. Brand"
        string variant_value "e.g. Odoo"
        numeric price_extra "NUMERIC(16, 4) - e.g. 560.00"
        string sku UK
    }

    BILLING_PLANS {
        uuid id PK
        string name
        string interval_unit "daily | weekly | monthly | yearly"
        int interval_count "e.g. 1 month, 3 months"
        int min_quantity "Minimum order seats"
        date available_from
        date available_to
        boolean can_be_paused "Admin policy"
        boolean can_be_renewed "Admin policy"
        boolean can_be_closed_early "Admin policy"
        boolean auto_close_at_end "Admin policy"
    }
```

---

## 3. Detailed Functional Specifications & Business Logic

### 3.1 Authentication & Role-Based Access Control (RBAC)
- **Password Complexity Validator (Regex):**
  $$\text{Regex: } ^(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{9,}$$$
  *Guard:* Any password $\le 8$ characters or missing an uppercase letter, lowercase letter, or special character is rejected with HTTP 422.
- **Role Permissions Matrix:**
  | Action | Admin | Staff | Customer |
  | :--- | :---: | :---: | :---: |
  | Create Staff Member | ✅ | ❌ | ❌ |
  | Create Products & Variants | ✅ | ❌ | ❌ |
  | Define Billing Plans | ✅ | ❌ | ❌ |
  | Create Quotations | ✅ | ✅ | ❌ |
  | View All Subscriptions | ✅ | ✅ | ❌ |
  | View Own Subscriptions | ✅ | ✅ | ✅ (Own Only) |
  | Download Own Invoices | ✅ | ✅ | ✅ (Own Only) |

### 3.2 Product Variant Pricing Algorithm
When a product variant is selected, its operational price is computed deterministically:
$$\text{Effective Unit Price} = \text{Product.base\_sales\_price} + \sum \text{Variant.price\_extra}$$

*Example from Problem Statement:*
- Product: "Enterprise ERP Software" $\rightarrow$ `base_sales_price = 1200.00`
- Variant: "Brand: Odoo" $\rightarrow$ `price_extra = 560.00`
- Calculated Unit Price = $1200.00 + 560.00 = \mathbf{1760.00}$.

### 3.3 Plan Recurrence & Policy Validation
- A plan can only be assigned to a new subscription if:
  1. `CURRENT_DATE >= available_from` (if set).
  2. `CURRENT_DATE <= available_to` (if set).
  3. Subscription line quantity $\ge$ `plan.min_quantity`.

---

## 4. API Endpoints Specification (Phase 1)

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register customer account with strict password validation. |
| `POST` | `/api/auth/login` | Public | Authenticate user & issue JWT token with role claims. |
| `POST` | `/api/auth/forgot-password` | Public | Generate single-use password reset link with token hash. |
| `POST` | `/api/auth/reset-password` | Public | Reset password using valid, unexpired token. |
| `POST` | `/api/admin/users/staff` | Admin Only | Admin provisions internal staff member accounts. |
| `GET` | `/api/products` | All Authenticated | List all products with their nested variants. |
| `POST` | `/api/products` | Admin Only | Create base product. |
| `POST` | `/api/products/{id}/variants` | Admin Only | Add variant with price delta (e.g. Odoo brand +560). |
| `GET` | `/api/plans` | All Authenticated | List active billing plans. |
| `POST` | `/api/plans` | Admin Only | Define new billing plan with recurrence & policy toggles. |

---

## 5. End-to-End Implementation Plan (Phase 1)

### Step 1.1: Project Setup & Core Configuration
- Initialize Python environment with `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `python-jose`, `passlib[bcrypt]`, `pytest`.
- Configure `core/config.py` supporting dual database URLs:
  - SQLite default: `sqlite:///./brightloop.db`
  - PostgreSQL override: `postgresql://user:pass@localhost:5432/brightloop`
- Establish centralized error handlers returning standardized JSON errors:
  ```json
  {"status": "error", "code": "VALIDATION_FAILED", "message": "Password must contain uppercase, lowercase, and special character"}
  ```

### Step 1.2: Database Models & Migrations
- Implement SQLAlchemy 2.0 declarative models in `models/identity.py`, `models/catalog.py`, `models/plans.py`.
- Enforce `NUMERIC(16, 4)` for all currency columns (`base_sales_price`, `cost_price`, `price_extra`).
- Create initial Alembic / SQLAlchemy metadata tables creation script.

### Step 1.3: Authentication & Security Services
- Implement `services/auth_service.py`:
  - `validate_password_complexity(password: str) -> bool`
  - `hash_password(raw: str) -> str`
  - `verify_password(raw: str, hashed: str) -> bool`
  - `generate_reset_token(user_id: str) -> str`
  - `verify_reset_token(token: str) -> Optional[User]`
- Implement JWT token generator with `role`, `user_id`, `email`, and 24-hour expiration.
- Implement FastAPI security dependency `get_current_user` and role-guard factory `require_role(["admin"])`.

### Step 1.4: Catalog & Plan Engine
- Implement `services/catalog_service.py` with transactional CRUD operations.
- Implement variant resolution algorithm calculating `effective_unit_price`.
- Implement `services/plan_service.py` enforcing date-window and quantity validations.

### Step 1.5: Verification & Automated Tests
- Create `tests/test_phase1_auth_catalog.py`:
  - Test 1: Password regex rejections (e.g., `pass123`, `Password123`, `Pass!`).
  - Test 2: Successful registration and login with JWT issue.
  - Test 3: Password reset flow (generate token, reset password, verify old token fails on 2nd attempt).
  - Test 4: RBAC restriction (Staff cannot create staff, customer cannot create products).
  - Test 5: Product + Odoo Variant (+560) unit price calculation.

### Step 1.6: Git Commit Milestone
- Run test suite: `pytest tests/test_phase1_auth_catalog.py -v`.
- Commit message: `feat(phase1): implement secure auth, rbac, product catalog with brand variants, and billing plans`.

---

## 6. Acceptance Criteria & Gravitas Verification Contract (Phase 1)

- [ ] **AC-1.1:** Attempting to register with password `Pass123` fails with HTTP 422 (must be $>8$ chars, uppercase, lowercase, special char).
- [ ] **AC-1.2:** Admin can create a staff member, but a staff member attempting to create another staff member gets HTTP 403 Forbidden.
- [ ] **AC-1.3:** Creating product with base price 1000 and Odoo brand variant with price extra 560 returns effective unit price 1560.
- [ ] **AC-1.4:** Password reset token expires after 15 minutes and cannot be reused twice.
- [ ] **AC-1.5:** Plan with `min_quantity = 5` rejects any order with quantity $< 5$.

---
*Signed off for Phase 1 Implementation.*
