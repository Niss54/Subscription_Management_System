# ⚡ AUTONOMOUS ENGINEERING EXECUTION PROMPT
# PRD 2: Commercial Quotation Pipeline, Subscription State Machine & Automated Mass Billing Engine
## Brightloop Software Subscription Billing Platform — Odoo Hackathon Winning Blueprint

> **Role Directive:** You are Antigravity acting as Principal Systems Architect & Senior Full-Stack Engineer enforcing GRAVITAS reliability invariants.  
> **Mission:** Build the complete, deterministic commercial sales and billing engine for Brightloop Software, guaranteeing zero double-billing and mathematical precision across taxes and discounts.  
> **Tech Stack:** **Next.js 15 (App Router, Server Actions, Route Handlers)** + **Supabase (PostgreSQL 17, Row-Level Security, RPC Functions)** + **GSAP Timelines & Morphing**.  
> **Design Philosophy:** Linear & Stripe Inspired: Deep Obsidian Carbon (`#090a0f`), Light Sky Blue Action Controls (`#38bdf8`), Interactive Kanban State Machine, Modal Invoice Drawer.  
> **Target SLA:** 100% Deterministic Recurring Invoicing | Zero Double-Billing Guarantee | Sub-2s Mass Invoice Generation.  
> **Mode:** Execution Prompt — contains 8 granular implementation phases. Each phase specifies **Building**, **Testing**, **Debugging**, and **Git Milestones**.  

---

## 🎨 UI/UX Specifications for Commercial Engine

1. **Quotation Builder Interface:**
   - Multi-line proposal composer with live variant surcharge calculator.
   - Validity period badge showing live expiration countdown.
2. **Subscription Kanban State Board:**
   - Visual drag-and-drop or one-click state progression columns: `Draft` (Slate), `Quotation` (Purple), `Confirmed` (Blue), `Active` (Emerald), `Paused` (Amber), `Closed` (Zinc).
   - Guarded transition buttons: Invalid transitions (e.g., trying to confirm an expired quote) are blocked with a clear contextual tooltip.
3. **Billing Day Mass Execution Banner:**
   - Status counter: *"142 Subscriptions due for billing today"*.
   - Action Button: Light Sky Blue gradient with pulse glow *"⚡ Execute Mass Billing Run"*.
   - Live GSAP progress timeline showing: *"Generating invoices... 100% completed. 0 duplicates. 0 skipped."*

---

## 📋 Comprehensive 8-Phase Execution Plan (PRD 2)

---

### 🟢 PHASE 2.1: Quotation Template Builder & Pre-Packaged Line Cloner (Scene 3 Part 1)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 3 Alignment:**
  - "Sales rep prepares offer for large customer starting from a quotation template that already has the right plan and product lines, and stays valid for a set number of days."

#### B. End-to-End Building Instructions
1. Database Schema in Supabase:
   ```sql
   CREATE TABLE quotation_templates (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name VARCHAR(100) NOT NULL,
       plan_id UUID NOT NULL REFERENCES billing_plans(id),
       validity_days INT NOT NULL DEFAULT 30 CHECK (validity_days > 0),
       payment_terms VARCHAR(100) NOT NULL DEFAULT 'Net 15',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   CREATE TABLE quotation_template_lines (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       template_id UUID NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
       product_variant_id UUID NOT NULL REFERENCES product_variants(id),
       default_quantity NUMERIC(12, 4) NOT NULL DEFAULT 1 CHECK (default_quantity > 0)
   );
   ```
2. Create `app/actions/quotationTemplateActions.ts`:
   - `createQuotationTemplate(name, planId, validityDays, paymentTerms, lines[])`: Admin Server Action.
   - `getQuotationTemplates()`: Returns all active templates with populated plan and product details.
3. Build `app/admin/templates/page.tsx`:
   - Form to assemble templates, select products & brand variants, and define default validity durations.

#### C. Testing & Verification
- Create template "Enterprise SaaS Onboarding" with 30 validity days, linking "Enterprise Suite (Odoo Brand)" variant.
- Verify lines persist and default quantities validate $> 0$.

#### D. Debugging Playbook
- *Cascade delete on template:* Ensure `ON DELETE CASCADE` is set on `quotation_template_lines` so deleting a template removes orphaned lines.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-2.1): implement quotation template engine with predefined lines and validity duration"
```

---

### 🟢 PHASE 2.2: Proposal-to-Subscription Pipeline & Unique Sequence Generator (Scene 3 Part 2)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 3 Alignment:**
  - "Each subscription gets its own number, customer, plan, start date, expiry date, and payment terms, with lines showing product, quantity, unit price, taxes, and amount."

#### B. End-to-End Building Instructions
1. Database Schema & Sequence Generator in Supabase:
   ```sql
   CREATE SEQUENCE subscription_seq START 1;

   CREATE OR REPLACE FUNCTION generate_subscription_number()
   RETURNS TRIGGER AS $$
   BEGIN
       NEW.subscription_number := 'SUB-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('subscription_seq')::TEXT, 4, '0');
       RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TABLE subscriptions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       subscription_number VARCHAR(50) UNIQUE NOT NULL,
       customer_id UUID NOT NULL REFERENCES profiles(id),
       plan_id UUID NOT NULL REFERENCES billing_plans(id),
       state subscription_state NOT NULL DEFAULT 'draft',
       start_date DATE NOT NULL DEFAULT CURRENT_DATE,
       expiry_date DATE,
       next_invoice_date DATE,
       payment_terms VARCHAR(100) NOT NULL DEFAULT 'Net 15',
       paused_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   CREATE TRIGGER trg_set_sub_num BEFORE INSERT ON subscriptions
   FOR EACH ROW WHEN (NEW.subscription_number IS NULL OR NEW.subscription_number = '')
   EXECUTE FUNCTION generate_subscription_number();

   CREATE TABLE subscription_lines (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
       product_variant_id UUID NOT NULL REFERENCES product_variants(id),
       quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
       unit_price NUMERIC(16, 4) NOT NULL CHECK (unit_price >= 0),
       tax_rule_id UUID REFERENCES tax_rules(id),
       subtotal NUMERIC(16, 4) NOT NULL
   );
   ```
2. Create `app/actions/subscriptionActions.ts`:
   - `createSubscriptionFromTemplate(templateId, customerId, customStartDate)`: Clones template lines, sets `expiry_date = customStartDate + template.validity_days`, and saves subscription in `draft` state.

#### C. Testing & Verification
- Create subscription from template.
- Verify generated `subscription_number` matches format `SUB-2026-0001`.
- Verify second subscription generates `SUB-2026-0002`.

#### D. Debugging Playbook
- *Concurrency sequence gaps:* Postgres sequences guarantee uniqueness even across concurrent transactions.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-2.2): implement subscription instantiation from templates with automated sequential numbering"
```

---

### 🟢 PHASE 2.3: Strict 6-State Subscription State Machine & Transition Guards (Scene 3 Part 3)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 3 Alignment:**
  - "Moves from Draft to Quotation to Confirmed to Active and finally to Closed, and anyone on the team should be able to see where it stands."
  - "Some plans should close on their own when they end, and others can be closed early, paused or renewed. The admin decides which, plan by plan."

#### B. End-to-End Building Instructions
1. State Machine Validator in `lib/state/subscriptionStateMachine.ts`:
   ```typescript
   export type SubscriptionState = 'draft' | 'quotation' | 'confirmed' | 'active' | 'paused' | 'closed';

   const VALID_TRANSITIONS: Record<SubscriptionState, SubscriptionState[]> = {
       draft: ['quotation', 'closed'],
       quotation: ['confirmed', 'closed'],
       confirmed: ['active', 'closed'],
       active: ['paused', 'closed'],
       paused: ['active', 'closed'],
       closed: [] // Terminal state
   };

   export function validateTransition(
       currentState: SubscriptionState,
       targetState: SubscriptionState,
       context: {
           isExpired: boolean;
           canBePaused: boolean;
           canBeClosedEarly: boolean;
       }
   ): { allowed: boolean; reason?: string } {
       if (!VALID_TRANSITIONS[currentState].includes(targetState)) {
           return { allowed: false, reason: `Illegal transition from ${currentState} to ${targetState}.` };
       }
       if (currentState === 'quotation' && targetState === 'confirmed' && context.isExpired) {
           return { allowed: false, reason: "Quotation has passed its validity date and cannot be confirmed." };
       }
       if (currentState === 'active' && targetState === 'paused' && !context.canBePaused) {
           return { allowed: false, reason: "The selected billing plan does not permit pausing." };
       }
       if (currentState === 'active' && targetState === 'closed' && !context.canBeClosedEarly) {
           return { allowed: false, reason: "The selected billing plan does not permit early closure." };
       }
       return { allowed: true };
   }
   ```
2. Implement Server Action `transitionSubscriptionState(subscriptionId, targetState)`:
   - When pausing: Set `paused_at = NOW()`.
   - When resuming (`paused` $\rightarrow$ `active`): Calculate $\Delta t = \text{NOW}() - \text{paused\_at}$, shift `next_invoice_date = next_invoice_date + \Delta t`.
   - When activating (`confirmed` $\rightarrow$ `active`): Trigger immediate creation of Invoice #1.

#### C. Testing & Verification
- Test 1: Confirming an expired quote throws validation error.
- Test 2: Pausing a subscription on a plan where `can_be_paused = False` is blocked.
- Test 3: Resuming a paused subscription advances `next_invoice_date` by the exact elapsed pause duration.

#### D. Debugging Playbook
- *Timezone skew on expiry checks:* Compare dates in UTC to avoid false expiration across local timezones.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-2.3): implement 6-state subscription machine with transition guards and pause date recalibration"
```

---

### 🟢 PHASE 2.4: Automated Mass Invoicing Worker with Idempotency Key (Scene 4 Part 1)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 4 Alignment:**
  - "It is billing day, and hundreds of subscriptions are due at once. Nobody should be typing invoices by hand. Each one should be created from its subscription... Nothing should be billed twice or skipped."

#### B. End-to-End Building Instructions
1. Database Schema in Supabase:
   ```sql
   CREATE TYPE invoice_status AS ENUM ('draft', 'confirmed', 'paid', 'cancelled');

   CREATE SEQUENCE invoice_seq START 1;

   CREATE TABLE invoices (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       invoice_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. 'INV-2026-0001'
       subscription_id UUID NOT NULL REFERENCES subscriptions(id),
       customer_id UUID NOT NULL REFERENCES profiles(id),
       status invoice_status NOT NULL DEFAULT 'draft',
       invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
       due_date DATE NOT NULL,
       amount_untaxed NUMERIC(16, 4) NOT NULL,
       amount_discount NUMERIC(16, 4) NOT NULL DEFAULT 0.0000,
       amount_tax NUMERIC(16, 4) NOT NULL DEFAULT 0.0000,
       amount_total NUMERIC(16, 4) NOT NULL,
       amount_paid NUMERIC(16, 4) NOT NULL DEFAULT 0.0000,
       idempotency_key VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```
2. Automated Billing Worker Engine in `lib/billing/billingWorker.ts`:
   ```typescript
   import crypto from 'crypto';

   export function generateIdempotencyKey(subId: string, periodStart: string, periodEnd: string): string {
       return crypto.createHash('sha256').update(`${subId}:${periodStart}:${periodEnd}`).digest('hex');
   }
   ```
3. Implement Server Action `executeMassBillingRun()`:
   - Queries:
     ```sql
     SELECT * FROM subscriptions 
     WHERE state = 'active' AND next_invoice_date <= CURRENT_DATE 
     FOR UPDATE SKIP LOCKED;
     ```
   - Computes `idempotency_key`. If already present, skips without error (idempotent).
   - Generates Invoice in `draft` status with cloned product lines, discounts, and taxes.
   - Advances `next_invoice_date` according to plan frequency (`daily`, `weekly`, `monthly`, `yearly`).

#### C. Testing & Verification
- Seed 10 active subscriptions with `next_invoice_date = CURRENT_DATE`.
- Trigger `executeMassBillingRun()` twice in succession.
- Verify total invoices generated is exactly 10, never 20.
- Verify database reports 0 duplicate key errors.

#### D. Debugging Playbook
- *Race condition during cron runs:* The database `UNIQUE (idempotency_key)` index acts as the ultimate physical guardrail against double-billing.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-2.4): implement automated mass billing worker with sha-256 idempotency and double-billing immunity"
```

---

### 🟢 PHASE 2.5: Admin Rule-Based Automated Tax Calculation Engine (Scene 4 Part 2)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 4 Alignment:**
  - "Taxes are calculated automatically from rules the admin has set."

#### B. End-to-End Building Instructions
1. Database Schema in Supabase:
   ```sql
   CREATE TABLE tax_rules (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name VARCHAR(100) NOT NULL,
       rate NUMERIC(5, 2) NOT NULL CHECK (rate >= 0), -- e.g. 18.00
       applicable_category VARCHAR(50) NOT NULL, -- 'software', 'service', 'all'
       is_active BOOLEAN NOT NULL DEFAULT TRUE
   );
   ```
2. Tax Calculator in `lib/pricing/taxCalculator.ts`:
   ```typescript
   export function calculateLineTax(taxableBase: number, taxRate: number): number {
       return Number(((taxableBase * taxRate) / 100).toFixed(4));
   }
   ```
3. Build `app/admin/taxes/page.tsx`:
   - Admin UI to define tax rules by product category and rate percentage.

#### C. Testing & Verification
- Create 18% tax rule for 'software' and 0% for 'service'.
- Invoice with $1,000 software line item produces exactly $180.00 tax.
- Verify taxes apply strictly to the discounted taxable base, never gross amount.

#### D. Debugging Playbook
- *Zero tax category:* Ensure products without an explicit tax category default to `0.00%` rather than throwing a null reference error.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-2.5): implement admin-configured automated tax rules engine with category matching"
```

---

### 🟢 PHASE 2.6: Dynamic Discount & Promotion Engine (Scene 5)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 5 Alignment:**
  - "Admin creates discount rules: fixed amount or percentage, with minimum purchase or quantity, start and end dates, and a limit on how many times it can be used."
  - "Discount can apply to specific products or to whole subscriptions. Once applied, appears on next invoice on its own and stops when expires or runs out."

#### B. End-to-End Building Instructions
1. Database Schema in Supabase:
   ```sql
   CREATE TYPE discount_type_enum AS ENUM ('percentage', 'fixed');
   CREATE TYPE discount_scope_enum AS ENUM ('subscription', 'product');

   CREATE TABLE discount_rules (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       code VARCHAR(50) UNIQUE NOT NULL,
       discount_type discount_type_enum NOT NULL,
       discount_value NUMERIC(16, 4) NOT NULL CHECK (discount_value > 0),
       min_purchase_amount NUMERIC(16, 4) DEFAULT 0.0000,
       min_quantity NUMERIC(12, 4) DEFAULT 0.0000,
       start_date DATE,
       end_date DATE,
       max_uses INT, -- NULL = unlimited
       current_uses INT NOT NULL DEFAULT 0,
       scope discount_scope_enum NOT NULL DEFAULT 'subscription',
       target_product_id UUID REFERENCES products(id),
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```
2. Discount Apportionment & Atomic Counter Engine in `lib/pricing/discountEngine.ts`:
   - Validates threshold and date range.
   - For multi-line invoices, distributes subscription-level discount proportionally across lines:
     $$D_i = \text{round}\left(D_{\text{total}} \times \frac{\text{Line}_i}{\sum \text{Lines}}, 4\right)$$
   - Executes atomic SQL update on `current_uses`:
     ```sql
     UPDATE discount_rules 
     SET current_uses = current_uses + 1 
     WHERE id = :id AND (max_uses IS NULL OR current_uses < max_uses)
     RETURNING id;
     ```

#### C. Testing & Verification
- Create discount `SAVE50` with `max_uses = 1`.
- Apply to Invoice #1 $\rightarrow$ succeeds.
- Apply to Invoice #2 $\rightarrow$ rejected with `DISCOUNT_MAX_USES_EXHAUSTED`.
- Verify tax is calculated on the net discounted amount.

#### D. Debugging Playbook
- *Counter increment timing:* Never increment `current_uses` on draft quote creation; increment strictly when an invoice is generated/confirmed.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-2.6): implement dynamic discount engine with atomic usage limits and proportional tax apportionment"
```

---

### 🟢 PHASE 2.7: Invoice Management, State Transitions & Team Actions (Scene 4 Part 3)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 4 Alignment:**
  - "The team can confirm, cancel, send or print any invoice, and each invoice moves from Draft to Confirmed to Paid."

#### B. End-to-End Building Instructions
1. Create `app/actions/invoiceActions.ts`:
   - `confirmInvoice(invoiceId)`: Shifts `draft` $\rightarrow$ `confirmed`.
   - `cancelInvoice(invoiceId)`: Voids invoice (blocked if payments exist).
   - `sendInvoice(invoiceId)`: Simulates client email dispatch.
2. Build `app/invoices/[id]/print/page.tsx`:
   - Clean, printable invoice layout styled with Tailwind `@media print`.
   - Includes Brightloop branding, invoice number, customer info, itemized lines, discounts, taxes, and total.

#### C. Testing & Verification
- Confirm an invoice; verify status shifts to `confirmed`.
- Click "Print Invoice"; verify print view opens with zero styling glitches.

#### D. Debugging Playbook
- *Printing layout cutoffs:* Use `break-inside-avoid` on table rows in `@media print` CSS.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-2.7): implement invoice lifecycle actions and high-definition printable layout"
```

---

### 🟢 PHASE 2.8: Concurrency Stress Test & Phase 2 Verification Gate

#### A. Architectural Specification
- Implement automated stress tests verifying idempotency and state machine transitions.

#### B. End-to-End Building Instructions
1. Create `tests/phase2_commercial.test.ts`:
   - Test 1: State machine transitions and invalid jump rejections.
   - Test 2: Mass billing idempotency under multi-threaded execution.
   - Test 3: Dynamic discount auto-expiry and atomic usage exhaustion.
   - Test 4: Tax ordering formula (applied to net discounted amount).
2. Run test script: `npx vitest run tests/phase2_commercial.test.ts`.

#### C. Testing & Verification
- Confirm all tests pass with 100% green assertions.

#### D. Debugging Playbook
- *Race condition in vitest:* Use transactional rollbacks between test runs.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "test(phase-2.8): implement comprehensive verification test harness for state machine, mass billing, and discounts"
```

---

## 7. Gravitas Invariant Verification Contract (Phase 2)

- [ ] **AC-2.1:** Quotations past their validity duration cannot be confirmed.
- [ ] **AC-2.2:** Plans prohibiting pause reject pause actions with `ACTION_NOT_PERMITTED_BY_PLAN`.
- [ ] **AC-2.3:** Mass billing run executed twice produces 0 duplicate invoices (Idempotency Key verified).
- [ ] **AC-2.4:** Discount with `max_uses = 1` exhausts atomically and auto-expires.
- [ ] **AC-2.5:** Taxes are calculated strictly on net discounted amounts.
- [ ] **AC-2.6:** Invoices support Confirm, Cancel, Send, and Print actions.

---
*End of PRD 2 Execution Specification.*
