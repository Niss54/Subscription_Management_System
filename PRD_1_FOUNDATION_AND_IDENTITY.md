# 🚀 AUTONOMOUS ENGINEERING EXECUTION PROMPT
# PRD 1: System Foundation, Identity Infrastructure, Product Catalog & Billing Plans
## Brightloop Software Subscription Billing Platform — Odoo Hackathon Winning Blueprint

> **Role Directive:** You are Antigravity acting as Principal Systems Architect & Senior Full-Stack Engineer enforcing GRAVITAS reliability invariants.  
> **Mission:** Build the complete, production-grade foundation of Brightloop Software's Subscription Management Platform to dominate an evaluation across 400 competing teams.  
> **Tech Stack:** **Next.js 15 (App Router, React 19, TypeScript)** + **Supabase (PostgreSQL 17, Row-Level Security, Auth)** + **Tailwind CSS v4** + **Three.js (Ambient Canvas)** + **GSAP (Timelines & Tickers)** + **Lucide React**.  
> **Design Philosophy:** Linear & Stripe Inspired: Deep Obsidian Matte Carbon (`#090a0f`) Dark Mode, Crisp Porcelain (`#ffffff`) Light Mode, Electric Light Sky Blue Glow Buttons (`#38bdf8` / `#0ea5e9`), Tabular Financial Figures. Never look like a generic AI template.  
> **Mode:** Execution Prompt — contains 7 granular implementation phases. Each phase specifies **Building**, **Testing**, **Debugging**, and **Git Milestones**.  

---

## 🎨 Design System & Visual Hierarchy Specifications

To guarantee a podium-grade user experience that wows hackathon judges within 5 seconds of loading:

### 1. Color Palette Tokens
```css
/* Dark Mode Tokens (Default) */
--bg-canvas: #090a0f;           /* Deep Obsidian / Matte Carbon */
--surface-card: #11141c;        /* Elevated Slate Card */
--surface-card-hover: #161b26;  /* Interactive Card Hover */
--border-subtle: rgba(255, 255, 255, 0.08); /* 1px crisp borders */
--border-active: rgba(56, 189, 248, 0.4);   /* Sky Blue Focus Ring */
--text-primary: #f8fafc;        /* Pure Zinc White */
--text-secondary: #94a3b8;      /* Slate 400 */
--text-muted: #64748b;          /* Slate 500 */
--btn-primary-gradient: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
--btn-glow: 0 0 24px rgba(56, 189, 248, 0.35);

/* Light Mode Tokens */
--bg-canvas-light: #ffffff;      /* Crisp Porcelain White */
--surface-card-light: #f8fafc;   /* Soft Ice Slate */
--border-subtle-light: #e2e8f0;  /* Slate 200 */
--text-primary-light: #0f172a;   /* Deep Slate 900 */
--text-secondary-light: #475569; /* Slate 600 */
--btn-primary-light: #0284c7;    /* Royal Sky Blue */
```

### 2. Component Micro-Interactions
- **Three.js Ambient Canvas:** An interactive, lightweight ambient particle mesh rendered in the background of the main layout, reacting smoothly to mouse movement with $< 2\%$ CPU utilization.
- **GSAP Fluid Transitions:** Tab switching between `/admin`, `/staff`, and `/portal` executes with a smooth sliding indicator and opacity crossfade.
- **Tabular Figures:** All prices, counts, and currencies enforce `font-variant-numeric: tabular-nums` to ensure numbers align vertically without visual jitter.

---

## 📋 Comprehensive 7-Phase Execution Plan (PRD 1)

---

### 🟢 PHASE 1.1: Next.js 15 Full-Stack Scaffold & Visual Canvas Engine

#### A. Architectural Specification
- Initialize Next.js 15 App Router project with TypeScript, ESLint, and Tailwind CSS v4.
- Install core production dependencies:
  ```bash
  npm install @supabase/supabase-js @supabase/ssr lucide-react gsap three @types/three clsx tailwind-merge
  ```
- Configure `tailwind.config.ts` with custom colors (`obsidian-950: #090a0f`, `card-900: #11141c`, `sky-glow: #38bdf8`).

#### B. End-to-End Building Instructions
1. Create `components/canvas/AmbientCanvas.tsx`:
   - Initialize a Three.js scene with 120 low-opacity geometric particles connected by subtle lines.
   - Attach a window resize listener and requestAnimationFrame loop with frame-rate damping.
2. Create `components/layout/ThemeToggle.tsx`:
   - Support seamless switching between Dark Mode (`#090a0f`) and Light Mode (`#ffffff`) using `next-themes` with zero hydration flash.
3. Create `app/layout.tsx`:
   - Embed font `Inter` or `Geist Sans`, the ambient canvas, toast container, and global navigation shell.

#### C. Testing & Verification
- Run `npm run dev` and navigate to `http://localhost:3000`.
- Verify background canvas renders at 60 FPS in Chrome DevTools Performance monitor.
- Toggle between dark and light modes; confirm zero layout shifts and correct background colors.

#### D. Debugging Playbook
- *Hydration mismatch on theme:* Ensure `suppressHydrationWarning` is added to `<html>`.
- *Three.js canvas blocking clicks:* Ensure CSS has `pointer-events: none` and `z-index: 0`.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-1.1): scaffold nextjs 15 app router with tailwind v4, threejs canvas, and theme engine"
```

---

### 🟢 PHASE 1.2: Design System Primitives & Role Portal Shell

#### A. Architectural Specification
- Implement high-venture design primitives inspired by Linear and Stripe.
- Build the 3-Tier Portal Shell supporting distinct tabs:
  1. **Admin Workspace (`/admin`)**: Catalog, Plans, Discounts, Taxes, System Audit.
  2. **Staff Operations (`/staff`)**: Quotation Builder, Subscription Kanban, Manual Billing Run, Payments.
  3. **Customer Self-Service (`/portal`)**: My Subscriptions, Invoices, Payment History.

#### B. End-to-End Building Instructions
1. Create `components/ui/Button.tsx`:
   - Variants: `sky-glow` (gradient light blue with ambient glow), `secondary` (glass slate border), `ghost`, `danger`.
2. Create `components/ui/MetricCard.tsx`:
   - Displays label, tabular value, icon, and trend badge with subtle border-glow on hover.
3. Create `components/navigation/TopNav.tsx`:
   - Displays Brightloop Software logo, role-selector pill (Admin / Staff / Customer), Theme Toggle, and User Profile menu.

#### C. Testing & Verification
- Click between Admin, Staff, and Customer navigation tabs.
- Confirm button hover states trigger the light-blue electric glow effect: `box-shadow: 0 0 20px rgba(56, 189, 248, 0.35)`.

#### D. Debugging Playbook
- *Tailwind classes not applying:* Verify `content` paths in `tailwind.config.ts` cover `./components/**/*.{ts,tsx}` and `./app/**/*.{ts,tsx}`.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-1.2): implement linear-inspired design primitives, metric cards, and 3-tier portal shell"
```

---

### 🟢 PHASE 1.3: Supabase Database Schema, Migrations & RLS Engine

#### A. Architectural Specification
- Provision managed PostgreSQL on Supabase (with automatic local SQLite fallback for offline judge evaluation).
- Deploy strict PostgreSQL types, foreign keys, and Row-Level Security (RLS) policies.

#### B. End-to-End Building Instructions
1. Create `supabase/migrations/01_initial_schema.sql`:
   ```sql
   -- Enable UUID generation
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

   -- User Profiles Enum & Table
   CREATE TYPE user_role AS ENUM ('admin', 'staff', 'customer');

   CREATE TABLE profiles (
       id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
       email VARCHAR(255) UNIQUE NOT NULL,
       full_name VARCHAR(100) NOT NULL,
       role user_role NOT NULL DEFAULT 'customer',
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

   -- RLS Policies
   CREATE POLICY "Users read own profile" ON profiles
       FOR SELECT TO authenticated USING (id = auth.uid());

   CREATE POLICY "Staff and Admin read all profiles" ON profiles
       FOR SELECT TO authenticated
       USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'staff'));

   CREATE POLICY "Admin write all profiles" ON profiles
       FOR ALL TO authenticated
       USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
   ```
2. Create `lib/supabase/client.ts` and `lib/supabase/server.ts` utilizing `@supabase/ssr`.

#### C. Testing & Verification
- Execute migration via Supabase CLI: `supabase db reset` or run SQL in Supabase dashboard.
- Verify `profiles` table is created with RLS enabled.
- Verify an authenticated user cannot read another user's profile if their role is `customer`.

#### D. Debugging Playbook
- *RLS infinite recursion:* Never query `profiles` directly inside a policy on `profiles` without a security definer helper function or subquery caching.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-1.3): deploy supabase postgresql schema with row level security and rbac policies"
```

---

### 🟢 PHASE 1.4: Cryptographic Auth, Password Regex & Token Reset (Scene 1)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 1 Alignment:**
  - "Each email can belong to only one account."
  - "Password must be more than eight characters, with an uppercase letter, a lowercase letter and a special character."
  - "If they forget it later, a reset link should arrive at their registered email."
  - "Admin controls whole system, internal staff handle day-to-day with limited access, customers see only own portal. Only admin can add new staff."

#### B. End-to-End Building Instructions
1. Implement Password Complexity Regex in `lib/validators/auth.ts`:
   ```typescript
   export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{9,}$/;

   export function validatePasswordComplexity(password: string): { valid: boolean; message?: string } {
       if (password.length <= 8) {
           return { valid: false, message: "Password must be strictly greater than 8 characters (minimum 9)." };
       }
       if (!/[A-Z]/.test(password)) {
           return { valid: false, message: "Password must contain at least one uppercase letter." };
       }
       if (!/[a-z]/.test(password)) {
           return { valid: false, message: "Password must contain at least one lowercase letter." };
       }
       if (!/\W/.test(password)) {
           return { valid: false, message: "Password must contain at least one special character." };
       }
       return { valid: true };
   }
   ```
2. Create `app/actions/authActions.ts`:
   - `registerCustomer(email, password, fullName)`: Validates regex, registers via Supabase Auth, creates `profiles` record with role `customer`.
   - `createStaffMember(email, password, fullName)`: Admin-only Server Action. Rejects with `HTTP 403 Forbidden` if caller role is not `admin`.
   - `requestPasswordReset(email)`: Generates cryptographically secure 32-byte hex token, stores `SHA256(token)` in `password_reset_tokens` with `expires_at = NOW() + INTERVAL '15 minutes'`.
   - `resetPasswordWithToken(token, newPassword)`: Validates token hash, checks `expires_at > NOW()` and `used == FALSE`, updates password, and marks `used = TRUE`.

#### C. Testing & Verification
- Unit Test 1: Submitting `Pass123` or `WeakPassword!` (no lower/upper/special or length $\le 8$) fails with exact error message.
- Unit Test 2: Submitting `Brightloop2026!` succeeds.
- Unit Test 3: Log in as staff; attempt to call `createStaffMember()` $\rightarrow$ verify 403 Forbidden.
- Unit Test 4: Request password reset; reuse token after 1st success $\rightarrow$ verify token is rejected.

#### D. Debugging Playbook
- *Token timing attacks:* Always verify reset token hashes using constant-time string comparison (`crypto.timingSafeEqual`).

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-1.4): implement strict password complexity regex, tokenized reset, and admin-only staff provisioning"
```

---

### 🟢 PHASE 1.5: Product Catalog & Brand Variant Surcharge Engine (Scene 2 Part 1)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 2 Alignment:**
  - "Admin adds product with name, type (software, service, addon), sales price, cost price, and notes."
  - "Offers product in variants, for example by brand, where choosing the Odoo brand adds 560 to the price."

#### B. End-to-End Building Instructions
1. Database Schema in Supabase:
   ```sql
   CREATE TABLE products (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name VARCHAR(255) NOT NULL,
       product_type VARCHAR(50) NOT NULL CHECK (product_type IN ('software', 'service', 'addon')),
       base_sales_price NUMERIC(16, 4) NOT NULL CHECK (base_sales_price >= 0),
       cost_price NUMERIC(16, 4) NOT NULL DEFAULT 0.0000,
       notes TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   CREATE TABLE product_variants (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
       attribute_name VARCHAR(100) NOT NULL, -- 'Brand'
       variant_value VARCHAR(100) NOT NULL,  -- 'Odoo'
       price_extra NUMERIC(16, 4) NOT NULL DEFAULT 0.0000, -- e.g. +560.00
       sku VARCHAR(100) UNIQUE NOT NULL
   );
   ```
2. Variant Price Calculation Helper in `lib/pricing/variantMath.ts`:
   ```typescript
   export function calculateEffectiveUnitPrice(basePrice: number, priceExtra: number): number {
       return Number((basePrice + priceExtra).toFixed(4));
   }
   ```
3. Create `app/admin/products/page.tsx`:
   - Interactive table listing products with expandable variants.
   - Modal to create products and add variant lines (e.g. Attribute: "Brand", Value: "Odoo", Price Extra: `+560.00`).
   - Live interactive price preview badge.

#### C. Testing & Verification
- Create base product "Brightloop Enterprise Suite" with `base_sales_price = 1000.00`.
- Add variant "Brand: Odoo" with `price_extra = 560.00`.
- Verify the system returns effective unit price `1560.00`.
- Verify negative base sales price is rejected at database constraint level.

#### D. Debugging Playbook
- *Floating point drift:* Always convert numerical inputs through `Decimal` or `toFixed(4)` before saving to prevent `1560.0000000000002`.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-1.5): implement product catalog with dynamic brand variant surcharge engine (+560 markup)"
```

---

### 🟢 PHASE 1.6: Billing Plans & Recurrence Policy Controls (Scene 2 Part 2)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 2 Alignment:**
  - "Plan: what it costs and how often it bills (daily, weekly, monthly, yearly), minimum quantity, and dates it is available."
  - "Some plans should close on their own when they end, and others can be closed early, paused or renewed. The admin decides which, plan by plan."

#### B. End-to-End Building Instructions
1. Database Schema in Supabase:
   ```sql
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
2. Create `app/admin/plans/page.tsx`:
   - Form to define plans with interval selectors (`daily`, `weekly`, `monthly`, `yearly`).
   - Toggle switches with visual indicators for policies:
     - `can_be_paused` (Switch)
     - `can_be_renewed` (Switch)
     - `can_be_closed_early` (Switch)
     - `auto_close_at_end` (Switch)
3. Implement Server Action `createBillingPlan()` with date window validations (`available_to >= available_from`).

#### C. Testing & Verification
- Create Plan "Daily Shop Basic" with interval `daily`, `min_quantity = 3`, `can_be_paused = False`.
- Verify database persists all 4 boolean flags correctly.
- Verify attempting to set `available_to` earlier than `available_from` returns validation error.

#### D. Debugging Playbook
- *Postgres ENUM serialization:* Ensure Supabase client maps `billing_interval` strictly as lowercase strings matching enum values.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-1.6): implement flexible billing plans with recurrence cadences and admin policy toggles"
```

---

### 🟢 PHASE 1.7: Automated Test Suite & Phase 1 Verification Gate

#### A. Architectural Specification
- Implement automated integration and unit test suite verifying all Phase 1 acceptance criteria.

#### B. End-to-End Building Instructions
1. Create `tests/phase1_foundation.test.ts`:
   - Test Suite 1: Password regex validation matrix (valid, short, missing upper, missing lower, missing symbol).
   - Test Suite 2: RBAC permissions enforcement (Staff cannot create staff).
   - Test Suite 3: Product variant math ($1000 + 560 = 1560$).
   - Test Suite 4: Plan policy flags persistence.
   - Test Suite 5: Reset token expiry after 15 minutes.
2. Add test runner script to `package.json`: `"test:phase1": "vitest run tests/phase1_foundation.test.ts"`.

#### C. Testing & Verification
- Run `npm run test:phase1`.
- Verify 100% of tests pass with green checkmarks.

#### D. Debugging Playbook
- *Environment variables in tests:* Mock Supabase client or point to local test SQLite instance.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "test(phase-1.7): implement automated verification test harness for auth, catalog, variants, and plans"
```

---

## 7. Gravitas Invariant Verification Contract (Phase 1)

- [ ] **AC-1.1:** Passwords $\le 8$ characters or missing special characters fail with clear error messages.
- [ ] **AC-1.2:** Only Admin can provision staff accounts; Staff provisioning attempts trigger HTTP 403.
- [ ] **AC-1.3:** Odoo Brand variant adds exactly +560.00 to the product base sales price.
- [ ] **AC-1.4:** Password reset tokens expire after 15 minutes and cannot be reused.
- [ ] **AC-1.5:** Plan policy flags (`can_be_paused`, `auto_close_at_end`, etc.) are enforced at API level.
- [ ] **AC-1.6:** UI seamlessly toggles between Obsidian Dark (`#090a0f`) and Porcelain Light (`#ffffff`) with Sky Blue Glow buttons.

---
*End of PRD 1 Execution Specification.*
