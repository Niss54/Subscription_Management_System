const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Set isolated test database
const TEST_DB = path.join(process.cwd(), 'test_e2e.db');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.DATABASE_PATH = TEST_DB;

const { getDb } = require('../lib/db');
const {
  validatePasswordComplexity,
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPasswordWithToken,
  createStaffAccount
} = require('../lib/auth/authManager');

const {
  createProduct,
  addProductVariant,
  getProductById,
  createBillingPlan,
  createTaxRule
} = require('../lib/catalog/catalogManager');

const {
  createQuotationTemplate,
  getQuotationTemplateById
} = require('../lib/templates/quotationTemplateManager');

const {
  createSubscriptionFromTemplate,
  getSubscriptionById
} = require('../lib/subscriptions/subscriptionManager');

const {
  transitionSubscriptionState
} = require('../lib/state/subscriptionStateMachine');

const {
  createDiscountRule,
  attachDiscountToSubscription
} = require('../lib/pricing/discountEngine');

const {
  executeMassBillingRun,
  getInvoiceById,
  confirmInvoice,
  cancelInvoice
} = require('../lib/billing/billingWorker');

const {
  recordPayment,
  getPaymentsForInvoice
} = require('../lib/payments/paymentManager');

const {
  getExecutiveFinancialDashboard,
  getOverdueAgingAnalysis
} = require('../lib/analytics/dashboardAnalytics');

const {
  getCustomerPortalData,
  verifyCustomerAccessToInvoice
} = require('../lib/portal/portalManager');

test('⚡ Master E2E Scene 1: Customer Signup, Security & RBAC', () => {
  // 1. Password policy verification (>8 chars, uppercase, lowercase, special char)
  assert.throws(() => validatePasswordComplexity('short1!'), /more than 8 characters/);
  assert.throws(() => validatePasswordComplexity('no_upper_123!'), /uppercase/);
  assert.throws(() => validatePasswordComplexity('NO_LOWER_123!'), /lowercase/);
  assert.throws(() => validatePasswordComplexity('NoSpecialChar123'), /special character/);
  assert.doesNotThrow(() => validatePasswordComplexity('Brightloop2026!'));

  // 2. User registration & unique email
  const cust = registerUser({
    email: 'alpha_customer@client.com',
    password: 'AlphaSecure2026!',
    full_name: 'Alpha Customer LLC',
    role: 'customer'
  });
  assert.ok(cust.token);
  assert.throws(() => registerUser({ email: 'alpha_customer@client.com', password: 'AlphaSecure2026!', full_name: 'Dup' }), /already registered/);

  // 3. Single-use 15-minute tokenized password reset
  const resetReq = requestPasswordReset('alpha_customer@client.com');
  const resetExec = resetPasswordWithToken(resetReq.resetToken, 'NewAlphaPass2026#');
  assert.strictEqual(resetExec.success, true);
  // Re-use blocked
  assert.throws(() => resetPasswordWithToken(resetReq.resetToken, 'AnotherPass2026#'), /invalid or has already been used/);

  // 4. Role Isolation: Only Admin provisions staff
  const admin = registerUser({ email: 'superadmin@brightloop.com', password: 'SuperAdminPass2026!', full_name: 'Super Admin', role: 'admin' });
  const staff = createStaffAccount(admin.id, { email: 'staff_rep@brightloop.com', password: 'StaffPass2026!', full_name: 'Sales Staff' });
  assert.strictEqual(staff.role, 'staff');
  assert.throws(() => createStaffAccount(cust.id, { email: 'fake@staff.com', password: 'FakePass2026!', full_name: 'Fake' }), /Forbidden/);
});

test('⚡ Master E2E Scene 2: Product Variants & Plan Policies (+560 Markup)', () => {
  const prod = createProduct({
    name: 'Brightloop ERP Core',
    product_type: 'software',
    base_sales_price: 1200.0,
    cost_price: 400.0
  });

  const odooVar = addProductVariant({
    product_id: prod.id,
    attribute_name: 'Brand',
    variant_value: 'Odoo Brand',
    price_extra: 560.0,
    sku: 'ERP-ODOO-E2E'
  });

  const fullProd = getProductById(prod.id);
  const odooLine = fullProd.variants.find(v => v.variant_value === 'Odoo Brand');
  assert.strictEqual(odooLine.total_price, 1760.0); // 1200 + 560 = 1760

  const plan = createBillingPlan({
    name: 'Monthly Tier',
    interval_unit: 'monthly',
    interval_count: 1,
    plan_price: 1760.0,
    can_be_paused: true,
    can_be_closed_early: true,
    auto_close_at_end: false
  });
  assert.strictEqual(plan.can_be_paused, true);
});

test('⚡ Master E2E Scene 3: Quotation Template, Expiry & 6-State Subscription Machine', () => {
  const plan = getDb().prepare("SELECT id FROM billing_plans LIMIT 1").get();
  const variant = getDb().prepare("SELECT id FROM product_variants LIMIT 1").get();
  const tax = createTaxRule({ name: 'Tax 18%', rate: 18.0, applicable_category: 'software' });

  const template = createQuotationTemplate({
    name: 'Enterprise Proposal',
    plan_id: plan.id,
    validity_days: 15,
    lines: [{ product_variant_id: variant.id, default_quantity: 1, tax_rule_id: tax.id }]
  });

  const cust = getDb().prepare("SELECT id FROM profiles WHERE role = 'customer' LIMIT 1").get();
  const sub = createSubscriptionFromTemplate({
    templateId: template.id,
    customerId: cust.id,
    startDateStr: '2026-11-01'
  });

  assert.ok(sub.subscription_number.startsWith('SUB-2026-'));
  assert.strictEqual(sub.expiry_date, '2026-11-16');

  // Transitions: draft -> quotation -> confirmed -> active -> paused -> active
  transitionSubscriptionState(sub.id, 'quotation');
  // Guard check: cannot confirm if expired
  assert.throws(() => transitionSubscriptionState(sub.id, 'confirmed', { isExpired: true }), /validity date/);
  transitionSubscriptionState(sub.id, 'confirmed', { isExpired: false });
  transitionSubscriptionState(sub.id, 'active');

  // Pause for 4 days
  const prevNextDate = getSubscriptionById(sub.id).next_invoice_date;
  transitionSubscriptionState(sub.id, 'paused', { pausedAt: '2026-11-01T00:00:00Z' });
  const resumedSub = transitionSubscriptionState(sub.id, 'active', { resumeTime: '2026-11-05T00:00:00Z' });
  
  const dOld = new Date(prevNextDate);
  const dNew = new Date(resumedSub.next_invoice_date);
  const diffDays = Math.round((dNew - dOld) / (1000 * 60 * 60 * 24));
  assert.strictEqual(diffDays, 4); // Shifted forward by 4 days of pause!
});

test('⚡ Master E2E Scene 4: Mass Billing Day & Zero Double-Billing Guarantee', () => {
  const sub = getDb().prepare("SELECT id FROM subscriptions WHERE state = 'active' LIMIT 1").get();
  getDb().prepare("UPDATE subscriptions SET next_invoice_date = '2026-11-01' WHERE id = ?").run(sub.id);

  const run1 = executeMassBillingRun({ executionDate: '2026-11-01' });
  assert.strictEqual(run1.invoicesGenerated, 1);
  assert.strictEqual(run1.duplicatesSkipped, 0);

  // Duplicate run produces zero new invoices
  getDb().prepare("UPDATE subscriptions SET next_invoice_date = '2026-11-01' WHERE id = ?").run(sub.id);
  const run2 = executeMassBillingRun({ executionDate: '2026-11-01' });
  assert.strictEqual(run2.invoicesGenerated, 0);
  assert.strictEqual(run2.duplicatesSkipped, 1);
});

test('⚡ Master E2E Scene 5: Dynamic Discounts & Net Tax Calculation', () => {
  const disc = createDiscountRule({
    code: 'VIP50',
    discount_type: 'percentage',
    discount_value: 50.0,
    max_uses: 1,
    scope: 'subscription'
  });

  const sub = getDb().prepare("SELECT id FROM subscriptions WHERE state = 'active' LIMIT 1").get();
  attachDiscountToSubscription(sub.id, disc.id);
  getDb().prepare("UPDATE subscriptions SET next_invoice_date = '2026-12-01' WHERE id = ?").run(sub.id);

  const run = executeMassBillingRun({ executionDate: '2026-12-01' });
  const inv = getInvoiceById(run.invoiceIds[0]);

  assert.strictEqual(inv.amount_untaxed, 1760.0);
  assert.strictEqual(inv.amount_discount, 880.0);
  assert.strictEqual(inv.amount_tax, 158.4); // 18% of 880
  assert.strictEqual(inv.amount_total, 1038.4);

  confirmInvoice(inv.id);
  const discRow = getDb().prepare("SELECT current_uses FROM discount_rules WHERE id = ?").get(disc.id);
  assert.strictEqual(discRow.current_uses, 1);
});

test('⚡ Master E2E Scene 6: Payment Recording & Partial Auto-Settlement', () => {
  const inv = getDb().prepare("SELECT id, amount_total FROM invoices WHERE status = 'confirmed' LIMIT 1").get();
  const admin = getDb().prepare("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1").get();

  // Partial pay
  const p1 = recordPayment({
    invoiceId: inv.id,
    amount: 500.0,
    paymentMethod: 'bank_transfer',
    referenceNote: 'Bank Transfer #1',
    recordedByUserId: admin.id
  });
  assert.strictEqual(p1.invoiceStatus, 'confirmed');

  // Final pay
  const remaining = Number((inv.amount_total - 500.0).toFixed(4));
  const p2 = recordPayment({
    invoiceId: inv.id,
    amount: remaining,
    paymentMethod: 'upi',
    referenceNote: 'UPI #2',
    recordedByUserId: admin.id
  });
  assert.strictEqual(p2.invoiceStatus, 'paid');
  assert.strictEqual(p2.isFullyPaid, true);
});

test('⚡ Master E2E Scene 7: Sub-2s Executive Dashboard & Customer Portal Isolation', () => {
  const dash = getExecutiveFinancialDashboard('2026-12-01');
  assert.ok(dash.executionLatencyMs < 2000);
  assert.strictEqual(dash.slaCompliant, true);
  assert.ok(dash.mrr > 0);

  const cust = getDb().prepare("SELECT id, email FROM profiles WHERE role = 'customer' LIMIT 1").get();
  const portal = getCustomerPortalData(cust.id);
  assert.strictEqual(portal.profile.email, cust.email);
  for (const s of portal.subscriptions) {
    assert.strictEqual(s.customer_id, cust.id);
  }
});
