const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Set isolated test database
const TEST_DB = path.join(process.cwd(), 'test_phase2.db');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.DATABASE_PATH = TEST_DB;

const { getDb } = require('../lib/db');
const { registerUser } = require('../lib/auth/authManager');
const { createProduct, addProductVariant, createBillingPlan, createTaxRule } = require('../lib/catalog/catalogManager');
const { createQuotationTemplate, getQuotationTemplateById } = require('../lib/templates/quotationTemplateManager');
const { createSubscriptionFromTemplate, getSubscriptionById } = require('../lib/subscriptions/subscriptionManager');
const { transitionSubscriptionState, validateTransition } = require('../lib/state/subscriptionStateMachine');
const { createDiscountRule, attachDiscountToSubscription, evaluateDiscountApplicability } = require('../lib/pricing/discountEngine');
const { executeMassBillingRun, getInvoiceById, confirmInvoice, cancelInvoice } = require('../lib/billing/billingWorker');

test('Phase 2.1: Quotation Template Creation with Pre-Packaged Lines', (t) => {
  const plan = createBillingPlan({
    name: 'SaaS Monthly Plan',
    interval_unit: 'monthly',
    interval_count: 1
  });

  const product = createProduct({
    name: 'Enterprise Suite',
    product_type: 'software',
    base_sales_price: 1200.0
  });

  const odooVariant = addProductVariant({
    product_id: product.id,
    attribute_name: 'Brand',
    variant_value: 'Odoo Brand',
    price_extra: 560.0,
    sku: 'ENT-ODOO-01'
  });

  const tax = createTaxRule({
    name: 'GST 18%',
    rate: 18.0,
    applicable_category: 'software'
  });

  const template = createQuotationTemplate({
    name: 'Enterprise SaaS Onboarding',
    plan_id: plan.id,
    validity_days: 30,
    payment_terms: 'Net 15',
    lines: [
      { product_variant_id: odooVariant.id, default_quantity: 2, tax_rule_id: tax.id }
    ]
  });

  assert.strictEqual(template.name, 'Enterprise SaaS Onboarding');
  assert.strictEqual(template.validity_days, 30);
  assert.strictEqual(template.lines.length, 1);
  assert.strictEqual(template.lines[0].unit_price, 1760.0);
  assert.strictEqual(template.lines[0].subtotal, 3520.0);
});

test('Phase 2.2: Proposal-to-Subscription Pipeline & Unique Sequence Generation', (t) => {
  const customer = registerUser({
    email: 'acme_corp@brightloop.com',
    password: 'AcmeSecurePass123!',
    full_name: 'Acme Corporation',
    role: 'customer'
  });

  const template = createQuotationTemplate({
    name: 'Startup Bundle',
    plan_id: getDb().prepare('SELECT id FROM billing_plans LIMIT 1').get().id,
    validity_days: 14,
    lines: [
      {
        product_variant_id: getDb().prepare('SELECT id FROM product_variants LIMIT 1').get().id,
        default_quantity: 1
      }
    ]
  });

  const sub1 = createSubscriptionFromTemplate({
    templateId: template.id,
    customerId: customer.id,
    startDateStr: '2026-11-01'
  });

  const sub2 = createSubscriptionFromTemplate({
    templateId: template.id,
    customerId: customer.id,
    startDateStr: '2026-11-01'
  });

  assert.ok(sub1.subscription_number.startsWith('SUB-2026-'));
  assert.ok(sub2.subscription_number.startsWith('SUB-2026-'));
  assert.notStrictEqual(sub1.subscription_number, sub2.subscription_number);
  assert.strictEqual(sub1.state, 'draft');
  assert.strictEqual(sub1.expiry_date, '2026-11-15'); // 2026-11-01 + 14 days
});

test('Phase 2.3: 6-State Subscription State Machine & Transition Guards', (t) => {
  const sub = getDb().prepare("SELECT id FROM subscriptions WHERE state = 'draft' LIMIT 1").get();
  
  // draft -> quotation
  let currentSub = transitionSubscriptionState(sub.id, 'quotation');
  assert.strictEqual(currentSub.state, 'quotation');

  // Guard: expired quote cannot be confirmed
  assert.throws(() => {
    transitionSubscriptionState(sub.id, 'confirmed', { isExpired: true });
  }, /Quotation has passed its validity date/);

  // quotation -> confirmed (valid)
  currentSub = transitionSubscriptionState(sub.id, 'confirmed', { isExpired: false });
  assert.strictEqual(currentSub.state, 'confirmed');

  // confirmed -> active
  currentSub = transitionSubscriptionState(sub.id, 'active');
  assert.strictEqual(currentSub.state, 'active');

  // active -> paused
  currentSub = transitionSubscriptionState(sub.id, 'paused', { pausedAt: '2026-11-05T00:00:00Z' });
  assert.strictEqual(currentSub.state, 'paused');
  assert.ok(currentSub.paused_at);

  // Resume: paused -> active (recalibrates next_invoice_date forward by 5 days)
  const prevNextDate = currentSub.next_invoice_date;
  currentSub = transitionSubscriptionState(sub.id, 'active', { resumeTime: '2026-11-10T00:00:00Z' });
  assert.strictEqual(currentSub.state, 'active');
  assert.strictEqual(currentSub.paused_at, null);
  
  const dOld = new Date(prevNextDate);
  const dNew = new Date(currentSub.next_invoice_date);
  const diffDays = Math.round((dNew - dOld) / (1000 * 60 * 60 * 24));
  assert.strictEqual(diffDays, 5); // Shifted by exactly 5 days of pause!
});

test('Phase 2.4: Automated Mass Billing Worker & Zero Double-Billing Guarantee', (t) => {
  // Set next_invoice_date to today for mass billing eligibility
  const activeSub = getDb().prepare("SELECT id FROM subscriptions WHERE state = 'active' LIMIT 1").get();
  getDb().prepare("UPDATE subscriptions SET next_invoice_date = '2026-11-01' WHERE id = ?").run(activeSub.id);

  // First execution: generates invoice
  const run1 = executeMassBillingRun({ executionDate: '2026-11-01' });
  assert.strictEqual(run1.invoicesGenerated, 1);
  assert.strictEqual(run1.duplicatesSkipped, 0);

  // Second execution (same period): Zero double-billing (Idempotency key immune)
  // Even if next_invoice_date was set back to test concurrent idempotency
  getDb().prepare("UPDATE subscriptions SET next_invoice_date = '2026-11-01' WHERE id = ?").run(activeSub.id);
  const run2 = executeMassBillingRun({ executionDate: '2026-11-01' });
  assert.strictEqual(run2.invoicesGenerated, 0);
  assert.strictEqual(run2.duplicatesSkipped, 1);
});

test('Phase 2.5 & 2.6: Dynamic Discounts & Tax Ordering on Net Discounted Base', (t) => {
  const discount = createDiscountRule({
    code: 'PROMO50',
    discount_type: 'percentage',
    discount_value: 50.0, // 50% off
    max_uses: 1,
    scope: 'subscription'
  });

  const sub = getDb().prepare("SELECT id FROM subscriptions WHERE state = 'active' LIMIT 1").get();
  attachDiscountToSubscription(sub.id, discount.id);

  // Reset next_invoice_date for execution
  getDb().prepare("UPDATE subscriptions SET next_invoice_date = '2026-12-01' WHERE id = ?").run(sub.id);
  const run = executeMassBillingRun({ executionDate: '2026-12-01' });
  assert.strictEqual(run.invoicesGenerated, 1);

  const invoice = getInvoiceById(run.invoiceIds[0]);
  assert.strictEqual(invoice.amount_untaxed, 1760.0);
  assert.strictEqual(invoice.amount_discount, 880.0); // 50% of 1760 = 880

  // Tax must be calculated strictly on net discounted amount ($880.00), at 18% = $158.40
  assert.strictEqual(invoice.amount_tax, 158.4);
  assert.strictEqual(invoice.amount_total, 1038.4); // 880 + 158.4 = 1038.4

  // Confirm invoice -> consumes atomic usage
  confirmInvoice(invoice.id);
  const updatedDiscount = getDb().prepare('SELECT current_uses FROM discount_rules WHERE id = ?').get(discount.id);
  assert.strictEqual(updatedDiscount.current_uses, 1);

  // Attempting to use again is exhausted
  const check = evaluateDiscountApplicability(discount, { untaxedSubtotal: 1000, totalQuantity: 1, currentDateStr: '2026-12-01' });
  // Since discount object had old count, check with fresh row:
  const freshDiscount = getDb().prepare('SELECT * FROM discount_rules WHERE id = ?').get(discount.id);
  const { evaluateDiscountApplicability: evalFresh } = require('../lib/pricing/discountEngine');
  const freshCheck = evalFresh(freshDiscount, { untaxedSubtotal: 1000, totalQuantity: 1, currentDateStr: '2026-12-01' });
  assert.strictEqual(freshCheck.applicable, false);
  assert.strictEqual(freshCheck.reason, 'DISCOUNT_MAX_USES_EXHAUSTED');
});

test('Phase 2.7: Invoice Lifecycle Transitions (Confirm & Cancel)', (t) => {
  const inv = getDb().prepare("SELECT id FROM invoices WHERE status = 'draft' LIMIT 1").get();
  if (inv) {
    const confirmed = confirmInvoice(inv.id);
    assert.strictEqual(confirmed.status, 'confirmed');

    const cancelled = cancelInvoice(inv.id);
    assert.strictEqual(cancelled.status, 'cancelled');
  }
});
