# 🚀 PRD PHASE 1: System Foundation, Identity, Catalog & Billing Plans
## Brightloop Software Subscription Billing Platform (Podium Winner Blueprint)

> **Document Version:** 3.0.0 (Judge-Ready Masterclass Edition)  
> **Engineering Mode:** GRAVITAS Invariant-Enforced Implementation  
> **Tech Stack:** **Next.js 15 (App Router, React 19, TypeScript)** + **Supabase (PostgreSQL 17, Row-Level Security, Auth)** + **Tailwind CSS v4** + **GSAP (Timelines & Tickers)** + **Three.js (Ambient Canvas)**  
> **Design Aesthetic:** Linear & Stripe Inspired: Obsidian Carbon (`#090a0f`) & Crisp Porcelain White (`#ffffff`), Electric Light Sky Blue Glow Buttons (`#38bdf8` / `#0ea5e9`), Tabular Financial Figures  
> **Target SLA:** 100% Functional Compliance with Brightloop Problem Statement | Sub-2s Response Time  
> **Phase Scope:** Next.js + Supabase Foundation, Identity & 3-Tier RBAC, Password Regex & Token Reset, Product Catalog & Brand Variants (+560 Markup), Billing Plans with Policy Controls  

---

## 1. Executive Context & Hackathon Winning Architecture

Phase 1 lays the bedrock of an enterprise-grade platform built to dominate an evaluation across 400 competing teams. Rather than a fragile template or a generic AI toy, this architecture combines **Next.js 15** for blazingly fast full-stack rendering with **Supabase** for managed PostgreSQL, strict Row-Level Security (RLS), and zero-data-loss decimal transactions.

```
+--------------------------------------------------------------------------------------------------+
|                                    NEXT.JS 15 + SUPABASE ARCHITECTURE                            |
+--------------------------------------------------------------------------------------------------+
|  PRESENTATION TIER (Next.js 15 App Router + React 19)                                           |
|  - Three.js Interactive Ambient Canvas (Hero background with subtle particle velocity)           |
|  - GSAP Timeline Engine (Micro-interactions, staggered card reveals, page transitions)          |
|  - Dark Mode: Obsidian Carbon (#090a0f) | Light Mode: Crisp Porcelain (#ffffff)                 |
|  - Action Buttons: High-Venture Light Sky Blue (#38bdf8 / #0ea5e9) with ambient glow             |
|  - Role-Segregated Portals: /admin (Operations), /staff (Sales/Desk), /portal (Customer)       |
+--------------------------------------------------+-----------------------------------------------+
                                                   | Server Actions / HTTPS
+--------------------------------------------------v-----------------------------------------------+
|  LOGIC & API TIER (Next.js Server Actions & Route Handlers)                                     |
|  - Password Regex Validator (>8 chars, uppercase, lowercase, special char)                      |
|  - Single-use, 15-minute tokenized password reset engine (SHA-256 hashed storage)               |
|  - Brand Variant Surcharge Engine (Base Price + Delta e.g. Odoo Brand +560.00)                   |
|  - Plan Policy Engine (Daily/Weekly/Monthly/Yearly, min_qty, auto-close, pause, renew toggles)   |
+--------------------------------------------------+-----------------------------------------------+
                                                   | RLS-Guarded Connections
+--------------------------------------------------v-----------------------------------------------+
|  PERSISTENCE TIER (Supabase Managed PostgreSQL 17 + Local SQLite Fallback Engine)                |
|  - Strict Decimal Arithmetic: NUMERIC(16, 4) on all currency columns                             |
|  - Row Level Security (RLS): Customer isolation (Customer A cannot read Customer B's records)   |
|  - Zero-Friction Dual Mode: Live Supabase cloud OR offline local SQLite for judge evaluation    |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. UI/UX Design System Specification (Stripe & Linear Inspired)

To ensure the platform looks like a top-tier venture-backed product rather than an AI-generated template:

### 2.1 Color Palette & Theme Tokens
| Token | Dark Mode (Default) | Light Mode | Application |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#090a0f` (Matte Obsidian) | `#ffffff` (Crisp Porcelain) | Full page root background |
| **Card Surface** | `#11141c` (Carbon Slate) | `#f8fafc` (Soft Ice White) | KPI cards, data tables, modals |
| **Border / Divider** | `rgba(255, 255, 255, 0.08)` | `#e2e8f0` (Slate 200) | Card outlines, table gridlines |
| **Primary Button** | `#38bdf8` $\rightarrow$ `#0ea5e9` | `#0284c7` $\rightarrow$ `#0ea5e9` | Light Sky Blue gradient with `shadow-[0_0_20px_rgba(56,189,248,0.3)]` |
| **Text Primary** | `#f8fafc` (Zinc 50) | `#0f172a` (Slate 900) | Headers, active values, metric figures |
| **Text Secondary** | `#94a3b8` (Slate 400) | `#64748b` (Slate 500) | Labels, subheadings, table headers |
| **Badge Accent** | `#38bdf8` (15% tint) | `#0ea5e9` (10% tint) | Variant tags, role indicators, status pills |

### 2.2 Micro-Interactions & Animation Stack
1. **Three.js Ambient Canvas:**
   - Subtle, GPU-accelerated particle constellation or gentle ambient noise mesh rendered on canvas behind the dashboard header.
   - Dampened mouse-follow interaction with zero CPU lag ($< 2\%$ utilization).
2. **GSAP (GreenSock) Micro-Interactions:**
   - Smooth button morph on state changes (e.g., Quotation $\rightarrow$ Confirmed).
   - Instant tab indicator slider when switching between **Admin View**, **Staff View**, and **Customer Portal**.
   - Metric tickers that count up smoothly on dashboard mount.
3. **Tabular Figures & Typography:**
   - Fonts: `Inter` or `Geist Sans` with CSS feature `font-variant-numeric: tabular-nums` to guarantee monetary numbers align vertically without jitter.

---

## 3. Database Schema & RLS Security Policies (Supabase DDL)

```sql
-- 1. Profiles & RBAC (Linked to auth.users)
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'customer');

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'customer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by self and internal staff" ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'staff'));

CREATE POLICY "Admin can manage all profiles" ON profiles
    FOR ALL TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 2. Single-Use Password Reset Tokens
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL, -- SHA-256 of raw random token
    expires_at TIMESTAMPTZ NOT NULL,  -- 15-minute expiration
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Product Catalog & Brand Variants
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    product_type VARCHAR(50) NOT NULL, -- 'software', 'service', 'addon'
    base_sales_price NUMERIC(16, 4) NOT NULL CHECK (base_sales_price >= 0),
    cost_price NUMERIC(16, 4) NOT NULL DEFAULT 0.0000,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute_name VARCHAR(100) NOT NULL, -- e.g. 'Brand'
    variant_value VARCHAR(100) NOT NULL,  -- e.g. 'Odoo'
    price_extra NUMERIC(16, 4) NOT NULL DEFAULT 0.0000, -- e.g. +560.00
    sku VARCHAR(100) UNIQUE NOT NULL
);

-- 4. Billing Plans with Policy Controls
CREATE TYPE billing_interval AS ENUM ('daily', 'weekly', 'monthly', 'yearly');

CREATE TABLE billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    interval_unit billing_interval NOT NULL,
    interval_count INT NOT NULL DEFAULT 1 CHECK (interval_count >= 1),
    plan_price NUMERIC(16, 4) NOT NULL DEFAULT 0.0000,
    min_quantity INT NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
    available_from DATE,
    available_to DATE,
    can_be_paused BOOLEAN NOT NULL DEFAULT TRUE,
    can_be_renewed BOOLEAN NOT NULL DEFAULT TRUE,
    can_be_closed_early BOOLEAN NOT NULL DEFAULT TRUE,
    auto_close_at_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Functional Specifications (Brightloop Scenes 1 & 2)

### 4.1 Scene 1: Customer Signup, Security & RBAC
- **Password Regex Enforcement:**
  $$\text{Complexity Pattern: } ^(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{9,}$$$
  - Length must strictly exceed 8 characters ($\ge 9$).
  - Must contain at least one uppercase letter, one lowercase letter, and one special symbol.
  - Rejection response: `HTTP 422 Unprocessable Entity` with actionable UI tooltip.
- **Single-Use Password Reset Engine:**
  - Token generated via `crypto.randomBytes(32).toString('hex')`.
  - Database stores only the SHA-256 digest: `SHA256(token)`.
  - Expiry set to $\text{NOW}() + 15 \text{ minutes}$.
  - Re-use guard: As soon as reset succeeds, `used = TRUE`. Subsequent requests with the same token fail with `TOKEN_EXPIRED_OR_USED`.
- **Role Permissions Isolation:**
  - `Admin`: Global super-user. Only role authorized to provision internal staff accounts and configure system-wide tax/discount rules.
  - `Staff`: Daily operations desk. Creates quotes, confirms subscriptions, monitors billing. Blocked from altering tax rates or adding other staff.
  - `Customer`: Self-service portal. Strictly isolated by Supabase RLS (`customer_id = auth.uid()`).

### 4.2 Scene 2: Product Variants & Plan Policies
- **Brand Variant Surcharge Math:**
  When a product variant is selected on a proposal line:
  $$\text{Unit Price} = \text{Product.base\_sales\_price} + \sum \text{Variant.price\_extra}$$
  *Problem Statement Anchor:* Enterprise Software ($1,200.00) with Brand: Odoo ($+560.00$) resolves to $\mathbf{1,760.00}$.
- **Plan Recurrence & Lifecycle Toggles:**
  - `interval_unit`: `daily`, `weekly`, `monthly`, `yearly`.
  - `auto_close_at_end`: If `TRUE`, subscription automatically terminates when reached `expiry_date`.
  - `can_be_paused`: If `FALSE`, staff/customer attempting to pause receives `ACTION_NOT_PERMITTED_BY_PLAN`.
  - `can_be_closed_early`: Governs whether premature contract cancellation is allowed.
  - `available_from` / `available_to`: Date range validity guard.

---

## 5. End-to-End Build, Debugging & Test Plan (Phase 1)

```
Step 1.1: Next.js 15 & Supabase Initialization
├── Setup Next.js 15 App Router with TypeScript and Tailwind CSS v4.
├── Install dependencies: @supabase/supabase-js, @supabase/ssr, gsap, three, lucide-react.
└── Configure Supabase environment variables (.env.local) with local SQLite fallback engine.

Step 1.2: Design System & Root Layout
├── Configure dark/light mode toggle with default dark (#090a0f obsidian canvas).
├── Build reusable UI components: <Button variant="sky-glow">, <MetricCard>, <Badge>, <Input>.
└── Embed Three.js background canvas component (<AmbientCanvas />) with smooth performance.

Step 1.3: Auth & RBAC Module
├── Implement /login, /register, and /forgot-password routes.
├── Implement client + server password regex validation (>8 chars, upper, lower, special).
├── Implement tokenized password reset flow with 15-minute expiry.
└── Add Next.js middleware enforcing role boundaries (/admin, /staff, /portal).

Step 1.4: Catalog & Plan Engine
├── Implement Products management UI with dynamic brand variant adder (+560 markup calculator).
├── Implement Billing Plans configuration form with interval dropdown and policy toggles.
└── Add Server Actions with Supabase RLS enforcement.

Step 1.5: Verification & Automated Test Suite
├── Unit Test 1: Password regex rejects 'WeakPass', 'Short1!', and accepts 'Brightloop2026!'.
├── Unit Test 2: Staff creation blocked for non-admin users (HTTP 403).
├── Unit Test 3: Odoo variant (+560) correctly calculates unit price.
└── Unit Test 4: Password reset token expires after 15 minutes and cannot be reused.
```

### Git Commit Milestone
```bash
git commit -m "feat(phase1): implement nextjs15 foundation, obsidian-sky ui, supabase rbac, catalog with brand variants, and plan policies"
```

---

## 6. Acceptance Criteria & Gravitas Contract (Phase 1)

- [ ] **AC-1.1:** Registration with password $\le 8$ characters or missing special characters fails with a clear validation error.
- [ ] **AC-1.2:** Admin can provision staff accounts; staff attempting to provision another staff member receives HTTP 403 Forbidden.
- [ ] **AC-1.3:** Selecting Odoo Brand variant on a product adds exactly 560.00 to the base price across all calculations.
- [ ] **AC-1.4:** Password reset token expires after 15 minutes and is invalidated immediately upon first use.
- [ ] **AC-1.5:** UI switches seamlessly between Obsidian Dark (`#090a0f`) and Porcelain Light (`#ffffff`) with Light Sky Blue glow buttons.

---
*Signed off for Phase 1 Implementation.*
