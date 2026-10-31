const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Set isolated test database
const TEST_DB = path.join(process.cwd(), 'test_phase3.db');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.DATABASE_PATH = TEST_DB;

const { getDb } = require('../lib/db');
const { registerUser } = require('../lib/auth/authManager');
const { createProduct, addProductVariant, createBillingPlan, createTaxRule } = require('../lib/catalog/catalogManager');
const { createQuotationTemplate } = require('../lib/templates/quotationTemplateManager');
const { createSubscriptionFromTemplate } = require('../lib/subscriptions/subscriptionManager');
const { transitionSubscriptionState } = require('../lib/state/subscriptionStateMachine');
const { executeMassBillingRun, getInvoiceById, confirmInvoice } = require('../lib/billing/billingWorker');
const { recordPayment, getPaymentsForInvoice } = require('../lib/payments/paymentManager');
const { getExecutiveFinancialDashboard, getOverdueAgingAnalysis } = require('../lib/analytics/dashboardAnalytics');
const { getCustomerPortalData, verifyCustomerAccessToInvoice } = require('../lib/portal/portalManager');

test('Setup Foundation for Phase 3 Tests', () => {
  const admin = registerUser({
    email: 'admin_p3@brightloop.com',
    password: 'AdminSuperPass1!',
    full_name: 'Admin Phase 3',
    role: 'admin'
  });

  const customerA = registerUser({
    email: 'cust_a@brightloop.com',
    password: 'CustPass2026A!',
    full_name: 'Customer A Org',
    role: 'customer'
  });

  const customerB = registerUser({
    email: 'cust_b@brightloop.com',
    password: 'CustPass2026B!',
    full_name: 'Customer B Org',
    role: 'customer'
  });

  const plan = createBillingPlan({
    name: 'Standard SaaS',
    interval_unit: 'monthly',
    interval_count: 1
  });

  const prod = createProduct({
    name: 'Platform Core',
    product_type: 'software',
    base_sales_price: 1000.0
  });

  const variant = addProductVariant({
    product_id: prod.id,
    attribute_name: 'Edition',
    variant_value: 'Standard',
    price_extra: 0.0,
    sku: 'PLAT-STD'
  });

  const template = createQuotationTemplate({
    name: 'Standard Proposal',
    plan_id: plan.id,
    validity_days: 30,
    lines: [{ product_variant_id: variant.id, default_quantity: 1 }]
  });

  // Create active subscription for Customer A
  const subA = createSubscriptionFromTemplate({
    templateId: template.id,
    customerId: customerA.id,
    startDateStr: '2026-11-01'
  });
  transitionSubscriptionState(subA.id, 'quotation');
  transitionSubscriptionState(subA.id, 'confirmed');
  transitionSubscriptionState(subA.id, 'active');

  // Create active subscription for Customer B
  const subB = createSubscriptionFromTemplate({
    templateId: template.id,
    customerId: customerB.id,
    startDateStr: '2026-11-01'
  });
  transitionSubscriptionState(subB.id, 'quotation');
  transitionSubscriptionState(subB.id, 'confirmed');
  transitionSubscriptionState(subB.id, 'active');
});

test('Phase 3.1 & 3.2: Partial Payment Allocation Engine & Auto-Settlement to Paid Status', () => {
  // Generate invoice for Customer A
  const billingRes = executeMassBillingRun({ executionDate: '2026-11-01' });
  assert.ok(billingRes.invoiceIds.length >= 1);

  const invId = billingRes.invoiceIds[0];
  let inv = getInvoiceById(invId);

  // Attempt payment on draft invoice fails (AC guard)
  const admin = getDb().prepare("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1").get();
  assert.throws(() => {
    recordPayment({
      invoiceId: invId,
      amount: 400.0,
      paymentMethod: 'bank_transfer',
      referenceNote: 'Draft payment test',
      recordedByUserId: admin.id
    });
  }, /INVALID_INVOICE_STATE/);

  // Confirm invoice
  confirmInvoice(invId);
  inv = getInvoiceById(invId);
  assert.strictEqual(inv.status, 'confirmed');
  assert.strictEqual(inv.amount_total, 1000.0);
  assert.strictEqual(inv.amount_paid, 0.0);

  // Partial Payment 1: $400.00
  const pay1 = recordPayment({
    invoiceId: invId,
    amount: 400.0,
    paymentMethod: 'wire_transfer',
    referenceNote: 'HDFC Wire #83921',
    recordedByUserId: admin.id
  });

  assert.strictEqual(pay1.amountRecorded, 400.0);
  assert.strictEqual(pay1.amountPaidTotal, 400.0);
  assert.strictEqual(pay1.amountRemaining, 600.0);
  assert.strictEqual(pay1.invoiceStatus, 'confirmed'); // Still confirmed
  assert.strictEqual(pay1.isFullyPaid, false);

  // Overpayment attempt throws error
  assert.throws(() => {
    recordPayment({
      invoiceId: invId,
      amount: 700.0, // Remaining is 600
      paymentMethod: 'credit_card',
      recordedByUserId: admin.id
    });
  }, /OVERPAYMENT_REJECTED/);

  // Final Payment 2: Remaining $600.00 -> Automatically transitions to 'paid'
  const pay2 = recordPayment({
    invoiceId: invId,
    amount: 600.0,
    paymentMethod: 'credit_card',
    referenceNote: 'Stripe Auth #CC-9941',
    recordedByUserId: admin.id
  });

  assert.strictEqual(pay2.amountRecorded, 600.0);
  assert.strictEqual(pay2.amountPaidTotal, 1000.0);
  assert.strictEqual(pay2.amountRemaining, 0.0);
  assert.strictEqual(pay2.invoiceStatus, 'paid'); // Status transitioned to PAID!
  assert.strictEqual(pay2.isFullyPaid, true);

  // Verify DB state
  const updatedInv = getInvoiceById(invId);
  assert.strictEqual(updatedInv.status, 'paid');
  assert.strictEqual(updatedInv.amount_paid, 1000.0);
  assert.strictEqual(updatedInv.amount_due, 0.0);
  assert.strictEqual(updatedInv.payments.length, 2);
});

test('Phase 3.3: Overdue Receivables Aging Analysis Across 4 Risk Buckets', () => {
  const db = getDb();
  const sub = db.prepare("SELECT id, customer_id FROM subscriptions LIMIT 1").get();
  
  // Seed invoices in different aging tiers
  // 1-30 days overdue (due: 2026-10-20, asOf: 2026-11-01 -> 12 days overdue)
  const id1 = '00000000-0000-0000-0000-000000000001';
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, status, invoice_date, due_date, billing_period_start, billing_period_end, amount_untaxed, amount_total, amount_paid, idempotency_key)
    VALUES (?, 'TEST-AGE-1', ?, ?, 'confirmed', '2026-10-01', '2026-10-20', '2026-10-01', '2026-10-31', 100.0, 100.0, 0.0, 'k1')
  `).run(id1, sub.id, sub.customer_id);

  // 31-60 days overdue (due: 2026-09-15 -> 47 days overdue)
  const id2 = '00000000-0000-0000-0000-000000000002';
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, status, invoice_date, due_date, billing_period_start, billing_period_end, amount_untaxed, amount_total, amount_paid, idempotency_key)
    VALUES (?, 'TEST-AGE-2', ?, ?, 'confirmed', '2026-09-01', '2026-09-15', '2026-09-01', '2026-09-30', 200.0, 200.0, 0.0, 'k2')
  `).run(id2, sub.id, sub.customer_id);

  // 61-90 days overdue (due: 2026-08-15 -> 78 days overdue)
  const id3 = '00000000-0000-0000-0000-000000000003';
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, status, invoice_date, due_date, billing_period_start, billing_period_end, amount_untaxed, amount_total, amount_paid, idempotency_key)
    VALUES (?, 'TEST-AGE-3', ?, ?, 'confirmed', '2026-08-01', '2026-08-15', '2026-08-01', '2026-08-31', 300.0, 300.0, 0.0, 'k3')
  `).run(id3, sub.id, sub.customer_id);

  // 90+ days overdue (due: 2026-05-01 -> 184 days overdue)
  const id4 = '00000000-0000-0000-0000-000000000004';
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, status, invoice_date, due_date, billing_period_start, billing_period_end, amount_untaxed, amount_total, amount_paid, idempotency_key)
    VALUES (?, 'TEST-AGE-4', ?, ?, 'confirmed', '2026-04-01', '2026-05-01', '2026-04-01', '2026-04-30', 400.0, 400.0, 0.0, 'k4')
  `).run(id4, sub.id, sub.customer_id);

  const aging = getOverdueAgingAnalysis('2026-11-01');
  assert.ok(aging.agingBuckets['1-30 Days'].count >= 1);
  assert.ok(aging.agingBuckets['31-60 Days'].count >= 1);
  assert.ok(aging.agingBuckets['61-90 Days'].count >= 1);
  assert.ok(aging.agingBuckets['90+ Days'].count >= 1);
});

test('Phase 3.4: Sub-2-Second Executive Financial Dashboard (<2s SLA)', () => {
  const dash = getExecutiveFinancialDashboard('2026-11-01');
  assert.ok(dash.executionLatencyMs < 2000, `Execution latency ${dash.executionLatencyMs}ms must be under 2000ms`);
  assert.strictEqual(dash.slaCompliant, true);
  assert.ok(dash.mrr > 0);
  assert.ok(dash.arr === Number((dash.mrr * 12).toFixed(2)));
  assert.ok(dash.activeSubscriptionsCount >= 2);
});

test('Phase 3.5 & 3.6: Customer Portal Tenant Isolation & Access Control', () => {
  const custA = getDb().prepare("SELECT * FROM profiles WHERE email = 'cust_a@brightloop.com'").get();
  const custB = getDb().prepare("SELECT * FROM profiles WHERE email = 'cust_b@brightloop.com'").get();

  const portalA = getCustomerPortalData(custA.id);
  assert.strictEqual(portalA.profile.email, 'cust_a@brightloop.com');
  // All subscriptions in portalA must belong exclusively to custA
  for (const s of portalA.subscriptions) {
    assert.strictEqual(s.customer_id, custA.id);
  }

  // Check tenant access guard on invoices
  const invA = portalA.invoices[0];
  if (invA) {
    // Cust A can access their own invoice
    assert.doesNotThrow(() => verifyCustomerAccessToInvoice(custA.id, invA.id));

    // Cust B attempting to access Cust A's invoice throws 403 Forbidden
    assert.throws(() => {
      verifyCustomerAccessToInvoice(custB.id, invA.id);
    }, /403_FORBIDDEN: Tenant Isolation Enforced/);
  }
});
