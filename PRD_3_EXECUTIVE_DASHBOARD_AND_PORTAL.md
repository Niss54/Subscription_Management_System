# 📊 AUTONOMOUS ENGINEERING EXECUTION PROMPT
# PRD 3: Financial Settlement, Sub-2s Executive Dashboard & Customer Self-Service Portal (Ship & Win)
## Brightloop Software Subscription Billing Platform — Odoo Hackathon Winning Blueprint

> **Role Directive:** You are Antigravity acting as Principal Systems Architect & Senior Full-Stack Engineer enforcing GRAVITAS reliability invariants.  
> **Mission:** Build the executive financial reporting engine and customer self-service portal, ensuring sub-200ms query latency across thousands of records, zero revenue leakage, and an animated GSAP dashboard that wins the hackathon.  
> **Tech Stack:** **Next.js 15 (App Router, Server Components)** + **Supabase (PostgreSQL 17 Indexes, RPC & RLS)** + **GSAP (Numerical CountUp Tickers)** + **Recharts** + **Lucide React**.  
> **Design Philosophy:** Linear & Stripe Inspired: Deep Obsidian Carbon (`#090a0f`), Light Sky Blue Action Controls (`#38bdf8`), Micro-Glow Metric Cards, Tabular Financial Figures.  
> **Target SLA:** Dashboard Response Time $< 2.0$ Seconds with 10,000+ Records (Measured $< 200\text{ms}$).  
> **Mode:** Execution Prompt — contains 8 granular implementation phases. Each phase specifies **Building**, **Testing**, **Debugging**, and **Git Milestones**.  

---

## 🎨 UI/UX Specifications for Executive Dashboard & Portal

1. **Executive Financial Dashboard (`/admin/dashboard`):**
   - **GSAP Animated Metrics:**
     - MRR Card: `$84,250.00` counts up smoothly with sky blue micro-glow.
     - Projected ARR Card: `$1,011,000.00` ($\text{MRR} \times 12$).
     - Active Contracts: `1,248 Active`.
     - Cash Collected This Month: `$62,400.00`.
   - **Overdue Aging Breakdown Bar:**
     - Interactive stacked visual chart showing unpaid receivables in 4 distinct risk tiers:
       - 1–30 Days (Sky Blue `#38bdf8`)
       - 31–60 Days (Amber `#f59e0b`)
       - 61–90 Days (Orange `#f97316`)
       - 90+ Days (Rose Red `#f43f5e`)
     - One-click click-through filter opening the exact overdue invoices for collection outreach.
2. **Customer Self-Service Portal (`/portal`):**
   - Clean, tenant-isolated dashboard where authenticated customers view active contracts, renewal dates, and past invoices.
   - One-click printable tax invoice download.

---

## 📋 Comprehensive 8-Phase Execution Plan (PRD 3)

---

### 🟢 PHASE 3.1: Multi-Method Payment Recording Ledger & Audit Trails (Scene 6 Part 1)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 6 Alignment:**
  - "Payments arrive by different methods and on different days. Each one needs to be recorded with its method, amount, date and a note, against the right invoice."

#### B. End-to-End Building Instructions
1. Database Schema in Supabase:
   ```sql
   CREATE TYPE payment_method_enum AS ENUM ('bank_transfer', 'credit_card', 'wire_transfer', 'cash', 'upi');

   CREATE TABLE payments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
       amount NUMERIC(16, 4) NOT NULL CHECK (amount > 0),
       payment_method payment_method_enum NOT NULL,
       payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       reference_note TEXT, -- e.g. "Wire transfer ref #HDFC-93821"
       recorded_by UUID NOT NULL REFERENCES profiles(id),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   CREATE TABLE audit_logs (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       entity_id UUID NOT NULL,
       entity_type VARCHAR(50) NOT NULL, -- 'subscription', 'invoice', 'payment'
       action VARCHAR(50) NOT NULL,       -- 'created', 'state_transition', 'reconciled'
       user_id UUID REFERENCES profiles(id),
       metadata JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```
2. Build Payment Recording Modal in `components/modals/RecordPaymentModal.tsx`:
   - Select payment method (`bank_transfer`, `credit_card`, `wire_transfer`, `cash`, `upi`).
   - Numerical input for amount (defaults to outstanding balance).
   - Date picker and reference note field.

#### C. Testing & Verification
- Record payment against confirmed invoice.
- Verify payment row is created with correct method and note.
- Verify audit log entry is written with auditor ID.

#### D. Debugging Playbook
- *Payment on draft invoice:* Restrict payments strictly to `confirmed` invoices; attempting to pay `draft` or `cancelled` invoices throws `INVALID_INVOICE_STATE`.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-3.1): implement multi-method payment ledger with reference notes and audit logging"
```

---

### 🟢 PHASE 3.2: Partial Payment Allocation Engine & Auto-Settlement (Scene 6 Part 2)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 6 Alignment:**
  - "At any moment, the team should be able to see which invoices are paid and which are still outstanding, so overdue ones can be chased."

#### B. End-to-End Building Instructions
1. Payment Allocation Server Action in `app/actions/paymentActions.ts`:
   ```typescript
   export async function recordPaymentAction(invoiceId: string, amount: number, method: string, note: string) {
       // 1. Fetch invoice
       const invoice = await getInvoiceById(invoiceId);
       if (invoice.status !== 'confirmed') {
           throw new Error("Only confirmed invoices accept payments.");
       }

       const newAmountPaid = Number((invoice.amount_paid + amount).toFixed(4));
       const isFullyPaid = newAmountPaid >= invoice.amount_total;

       // 2. Atomic Database Update
       await supabase.from('invoices').update({
           amount_paid: newAmountPaid,
           status: isFullyPaid ? 'paid' : 'confirmed'
       }).eq('id', invoiceId);

       // 3. Insert Payment Record
       await supabase.from('payments').insert({
           invoice_id: invoiceId,
           amount: amount,
           payment_method: method,
           reference_note: note,
           recorded_by: currentUserId
       });
   }
   ```

#### C. Testing & Verification
- Invoice total = $1,000.00.
- Record payment of $400.00 $\rightarrow$ status remains `confirmed`, `amount_paid = 400.00`, `amount_due = 600.00`.
- Record second payment of $600.00 $\rightarrow$ status automatically transitions to `paid`.

#### D. Debugging Playbook
- *Overpayment prevention:* Add validation guard: `if (amount > invoice.amount_total - invoice.amount_paid) throw new Error("Payment exceeds outstanding balance")`.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-3.2): implement partial payment allocation engine with automatic transition to paid status"
```

---

### 🟢 PHASE 3.3: Overdue Receivables Aging Analysis (Scene 6 Part 3 / Scene 7 Part 1)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 7 Alignment:**
  - "Which invoices are overdue? Today, answering those questions takes days."

#### B. End-to-End Building Instructions
1. Overdue Aging SQL Calculation:
   ```sql
   SELECT 
       CASE 
           WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN '1-30 Days'
           WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN '31-60 Days'
           WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN '61-90 Days'
           ELSE '90+ Days'
       END AS aging_bucket,
       COUNT(id) AS invoice_count,
       ROUND(SUM(amount_total - amount_paid), 2) AS total_unpaid
   FROM invoices 
   WHERE status = 'confirmed' AND due_date < CURRENT_DATE
   GROUP BY aging_bucket;
   ```
2. Build `app/admin/overdue/page.tsx`:
   - Interactive table of all overdue invoices grouped by aging bucket.
   - Filter by customer, aging range, and amount.
   - One-click "Send Dunning Reminder" action.

#### C. Testing & Verification
- Seed invoice with `due_date = CURRENT_DATE - 15` $\rightarrow$ classified into '1-30 Days'.
- Seed invoice with `due_date = CURRENT_DATE - 75` $\rightarrow$ classified into '61-90 Days'.

#### D. Debugging Playbook
- *Excluding paid invoices:* Ensure `WHERE status = 'confirmed'` is applied so paid invoices past their due date are never counted as overdue debt.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-3.3): implement overdue aging classification across 1-30, 31-60, 61-90, and 90+ day risk buckets"
```

---

### 🟢 PHASE 3.4: Sub-2-Second Executive Financial Dashboard (<2s SLA) (Scene 7 Part 2)

#### A. Architectural Specification
- **Brightloop Problem Statement Scene 7 Alignment:**
  - "How many subscriptions are active? How much revenue came in, and how much is still owed? The finance lead wants one place to see active subscriptions, revenue, payments and overdue invoices, with filters and a summary view. With thousands of subscriptions on the books, every page should still respond in under two seconds."

#### B. End-to-End Building Instructions
1. Deploy Supabase Single-Pass Aggregated RPC Function:
   ```sql
   CREATE OR REPLACE FUNCTION get_executive_financial_dashboard()
   RETURNS JSONB
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   DECLARE
       result JSONB;
   BEGIN
       WITH mrr_calc AS (
           SELECT 
               ROUND(COALESCE(SUM(
                   CASE 
                       WHEN bp.interval_unit = 'daily'   THEN (sl.quantity * sl.unit_price) * 30.4375
                       WHEN bp.interval_unit = 'weekly'  THEN (sl.quantity * sl.unit_price) * 4.348
                       WHEN bp.interval_unit = 'monthly' THEN (sl.quantity * sl.unit_price) / bp.interval_count
                       WHEN bp.interval_unit = 'yearly'  THEN (sl.quantity * sl.unit_price) / (12 * bp.interval_count)
                       ELSE 0 
                   END
               ), 0), 2) AS total_mrr,
               COUNT(DISTINCT s.id) AS active_subs_count
           FROM subscriptions s
           JOIN billing_plans bp ON s.plan_id = bp.id
           JOIN subscription_lines sl ON sl.subscription_id = s.id
           WHERE s.state = 'active'
       ),
       aging_calc AS (
           SELECT 
               ROUND(COALESCE(SUM(CASE WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN (amount_total - amount_paid) ELSE 0 END), 0), 2) AS bucket_1_30,
               ROUND(COALESCE(SUM(CASE WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN (amount_total - amount_paid) ELSE 0 END), 0), 2) AS bucket_31_60,
               ROUND(COALESCE(SUM(CASE WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN (amount_total - amount_paid) ELSE 0 END), 0), 2) AS bucket_61_90,
               ROUND(COALESCE(SUM(CASE WHEN CURRENT_DATE - due_date > 90 THEN (amount_total - amount_paid) ELSE 0 END), 0), 2) AS bucket_90_plus,
               ROUND(COALESCE(SUM(amount_total - amount_paid), 0), 2) AS total_overdue_debt
           FROM invoices 
           WHERE status = 'confirmed' AND due_date < CURRENT_DATE
       ),
       cash_calc AS (
           SELECT 
               ROUND(COALESCE(SUM(amount), 0), 2) AS cash_collected_this_month
           FROM payments 
           WHERE payment_date >= date_trunc('month', CURRENT_DATE)
       )
       SELECT json_build_object(
           'mrr', mrr_calc.total_mrr,
           'arr', ROUND(mrr_calc.total_mrr * 12, 2),
           'active_subscriptions', mrr_calc.active_subs_count,
           'cash_collected', cash_calc.cash_collected_this_month,
           'total_overdue_debt', aging_calc.total_overdue_debt,
           'aging_buckets', json_build_object(
               '1_30', aging_calc.bucket_1_30,
               '31_60', aging_calc.bucket_31_60,
               '61_90', aging_calc.bucket_61_90,
               '90_plus', aging_calc.bucket_90_plus
           )
       ) INTO result
       FROM mrr_calc, aging_calc, cash_calc;

       RETURN result;
   END;
   $$;
   ```
2. Build `app/admin/dashboard/page.tsx`:
   - High-speed server component calling `get_executive_financial_dashboard()`.
   - Injects `X-Response-Time-Ms` header verifying execution $< 200\text{ms}$.

#### C. Testing & Verification
- Execute dashboard query on database populated with 1,000+ active subscriptions.
- Measure execution latency using Chrome DevTools Network Tab: confirms $< 200\text{ms}$, well within the $< 2.0$ second mandate.

#### D. Debugging Playbook
- *Index missing:* Verify composite index `CREATE INDEX idx_perf_sub_mrr ON subscriptions(state, plan_id)` is active.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-3.4): implement single-pass executive financial analytics rpc delivering sub-200ms query latency"
```

---

### 🟢 PHASE 3.5: Venture-Grade UI Data Visualization & GSAP Number Tickers

#### A. Architectural Specification
- Implement smooth GSAP numerical count-up animations on metric cards and interactive Recharts overdue breakdown.

#### B. End-to-End Building Instructions
1. Create `components/dashboard/CountUpNumber.tsx`:
   - Utilizes GSAP `to()` tween on dummy object to interpolate numbers from 0 to target value with tabular formatting.
2. Create `components/dashboard/OverdueAgingChart.tsx`:
   - Stacked bar / donut chart with interactive hover tooltips highlighting risk tiers.
3. Build Filter Toolbar:
   - Filter by date range, customer segment, plan frequency, and invoice status.

#### C. Testing & Verification
- Reload dashboard page.
- Verify MRR counter smoothly rolls up to target figure over 1.2 seconds with zero visual stutter.

#### D. Debugging Playbook
- *Re-render loop in GSAP:* Ensure `useGSAP` or `useEffect` includes proper cleanup to prevent animation memory leaks.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-3.5): integrate gsap numerical count-up tickers and interactive overdue aging charts"
```

---

### 🟢 PHASE 3.6: Customer Self-Service Portal (`/portal`) (Scene 1 & Scene 7)

#### A. Architectural Specification
- **Brightloop Problem Statement Alignment:**
  - "Customers want to see and manage their own subscriptions without having to email anyone."
  - "Customers see only their own subscriptions and invoices through a portal."

#### B. End-to-End Building Instructions
1. Create `app/portal/page.tsx`:
   - Layout with two dedicated customer tabs: **My Subscriptions** and **My Invoices**.
   - My Subscriptions: Displays active plan, next billing date, renewal status, and pause toggle (if allowed by plan).
   - My Invoices: Displays past invoices, payment status pills (`Draft`, `Confirmed`, `Paid`), and "Download PDF Receipt" button.
2. Enforce Supabase RLS Policy:
   ```sql
   CREATE POLICY "Customer reads own invoices only" ON invoices
       FOR SELECT TO authenticated
       USING (customer_id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'staff'));
   ```

#### C. Testing & Verification
- Log in as Customer A.
- Attempt to navigate to Customer B's invoice ID $\rightarrow$ returns HTTP 403 Forbidden.
- Download invoice receipt; verify customer details and line items render cleanly.

#### D. Debugging Playbook
- *Customer modifying contract directly:* Ensure Customer role is restricted to `SELECT` on subscriptions, with actions (like cancel or pause) going through guarded server action checks.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-3.6): implement customer self-service portal with rls tenant isolation and receipt downloads"
```

---

### 🟢 PHASE 3.7: 500+ Record Database Seeder for Live Hackathon Demonstration

#### A. Architectural Specification
- Build an automated TypeScript seeder populating Brightloop with 500+ realistic records for instant judge evaluation.

#### B. End-to-End Building Instructions
1. Create `scripts/seed_demo_data.ts`:
   - Provisions 1 Admin (`admin@brightloop.com`), 2 Staff (`staff1@brightloop.com`, `staff2@brightloop.com`), 15 Customers.
   - Provisions Products:
     - "Brightloop Cloud Suite" (Sales: 1200.00, Cost: 400.00)
     - Variant: "Brand: Odoo" (Price Extra: +560.00)
     - "AI Analytics Addon" (Sales: 250.00)
   - Provisions Plans: Daily, Weekly, Monthly, Yearly.
   - Generates 500+ Subscriptions across Draft, Confirmed, Active, Paused, Closed.
   - Generates Invoices with overdue aging across 1-30, 31-60, 61-90, 90+ days.
   - Generates Payments showing full and partial settlements.
2. Add NPM command: `"seed": "npx tsx scripts/seed_demo_data.ts"`.

#### C. Testing & Verification
- Run `npm run seed`.
- Verify database reports 500+ active records seeded in $< 5$ seconds.
- Open Dashboard $\rightarrow$ metrics populate instantly with realistic revenue numbers.

#### D. Debugging Playbook
- *Foreign key sequence during seeding:* Seed in strict dependency order: Profiles $\rightarrow$ Products $\rightarrow$ Variants $\rightarrow$ Plans $\rightarrow$ Templates $\rightarrow$ Subscriptions $\rightarrow$ Invoices $\rightarrow$ Payments.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "feat(phase-3.7): implement automated 500-record database seeder for live hackathon demonstration"
```

---

### 🟢 PHASE 3.8: Complete Gravitas Verification Test Suite & Final Release Tag

#### A. Architectural Specification
- End-to-end automated test runner asserting all 7 scenes from the Brightloop Problem Statement.

#### B. End-to-End Building Instructions
1. Create `tests/e2e_brightloop_verification.test.ts`:
   - Scene 1 Test: User signup password regex & single-use reset token.
   - Scene 2 Test: Product brand variant surcharge (+560.00) and plan recurrence.
   - Scene 3 Test: Quotation template expansion & subscription state machine.
   - Scene 4 Test: Automated mass billing with SHA-256 idempotency key (zero double-billing).
   - Scene 5 Test: Dynamic discount auto-application, proportional tax, and max uses exhaustion.
   - Scene 6 Test: Multi-method payment recording and partial settlement auto-paid.
   - Scene 7 Test: Executive dashboard query latency $< 2.0$ seconds on 500+ records.
2. Execute full test suite: `npm test`.

#### C. Testing & Verification
- Verify 100% of test suites pass with green checkmarks.
- Tag final git release: `git tag -a v1.0.0 -m "Release v1.0.0: Brightloop Subscription Billing Platform"`.

#### D. Debugging Playbook
- *Zero flaky tests:* Ensure database teardown / transaction rollback cleans state after each test.

#### E. Git Commit Milestone
```bash
git add .
git commit -m "chore(phase-3.8): finalize end-to-end verification test suite and tag production release v1.0.0"
git tag v1.0.0
```

---

## 7. Gravitas Invariant Verification Contract (Phase 3)

- [ ] **AC-3.1:** Partial payments atomically increment `amount_paid` and leave invoice in `confirmed` status with correct `amount_due`.
- [ ] **AC-3.2:** Recording final payment automatically updates invoice status to `paid`.
- [ ] **AC-3.3:** Overdue invoices are grouped accurately into 1–30, 31–60, 61–90, and 90+ day aging buckets.
- [ ] **AC-3.4:** Customer portal returns only the authenticated customer's records (Row-Level Security verified).
- [ ] **AC-3.5:** Executive dashboard RPC query executes in $< 200\text{ms}$ on a database with 500+ records.
- [ ] **AC-3.6:** Seeder populates 500+ realistic records for live demonstration.

---
*End of PRD 3 Execution Specification.*

