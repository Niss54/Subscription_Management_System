const crypto = require('node:crypto');
const { getDb, nextSequence } = require('../db');
const { getQuotationTemplateById } = require('../templates/quotationTemplateManager');
const { getBillingPlanById } = require('../catalog/catalogManager');

function generateSubscriptionNumber() {
  const year = new Date().getFullYear();
  const seq = nextSequence('subscription_seq');
  return `SUB-${year}-${String(seq).padStart(4, '0')}`;
}

function calculateNextInvoiceDate(startDateStr, intervalUnit, intervalCount = 1) {
  const d = new Date(startDateStr);
  switch (intervalUnit) {
    case 'daily':
      d.setDate(d.getDate() + intervalCount);
      break;
    case 'weekly':
      d.setDate(d.getDate() + (7 * intervalCount));
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + intervalCount);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + intervalCount);
      break;
  }
  return d.toISOString().split('T')[0];
}

function createSubscriptionFromTemplate({ templateId, customerId, startDateStr = new Date().toISOString().split('T')[0], notes = '' }) {
  const db = getDb();
  const template = getQuotationTemplateById(templateId);
  if (!template) {
    throw new Error("Quotation template not found.");
  }

  const customer = db.prepare('SELECT id FROM profiles WHERE id = ?').get(customerId);
  if (!customer) {
    throw new Error("Customer profile not found.");
  }

  // Expiry date calculation: startDate + validity_days
  const startD = new Date(startDateStr);
  const expiryD = new Date(startD);
  expiryD.setDate(expiryD.getDate() + template.validity_days);
  const expiryDateStr = expiryD.toISOString().split('T')[0];

  const subNumber = generateSubscriptionNumber();
  const subscriptionId = crypto.randomUUID();

  // Next invoice date starts on startDate for immediate first invoice upon activation
  const nextInvoiceDateStr = startDateStr;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO subscriptions (
        id, subscription_number, customer_id, plan_id, state,
        start_date, expiry_date, next_invoice_date, payment_terms, notes
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
    `).run(
      subscriptionId, subNumber, customerId, template.plan_id,
      startDateStr, expiryDateStr, nextInvoiceDateStr, template.payment_terms, notes
    );

    // Clone template lines
    for (const tLine of template.lines) {
      const lineId = crypto.randomUUID();
      const unitPrice = tLine.unit_price;
      const subtotal = Number((unitPrice * tLine.default_quantity).toFixed(4));
      
      db.prepare(`
        INSERT INTO subscription_lines (
          id, subscription_id, product_variant_id, quantity, unit_price, tax_rule_id, subtotal
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(lineId, subscriptionId, tLine.product_variant_id, tLine.default_quantity, unitPrice, tLine.tax_rule_id || null, subtotal);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getSubscriptionById(subscriptionId);
}

function getSubscriptionById(id) {
  const db = getDb();
  const sub = db.prepare(`
    SELECT s.*, bp.name AS plan_name, bp.interval_unit, bp.interval_count, bp.can_be_paused, bp.can_be_closed_early, bp.auto_close_at_end, p.full_name AS customer_name, p.email AS customer_email
    FROM subscriptions s
    JOIN billing_plans bp ON s.plan_id = bp.id
    JOIN profiles p ON s.customer_id = p.id
    WHERE s.id = ?
  `).get(id);

  if (!sub) return null;

  const lines = db.prepare(`
    SELECT sl.*, pv.variant_value, pv.sku, prod.name AS product_name, prod.product_type, tr.rate AS tax_rate, tr.name AS tax_name
    FROM subscription_lines sl
    JOIN product_variants pv ON sl.product_variant_id = pv.id
    JOIN products prod ON pv.product_id = prod.id
    LEFT JOIN tax_rules tr ON sl.tax_rule_id = tr.id
    WHERE sl.subscription_id = ?
  `).all(id);

  const discounts = db.prepare(`
    SELECT sd.id AS subscription_discount_id, sd.subscription_id, sd.applied_at, dr.*
    FROM subscription_discounts sd
    JOIN discount_rules dr ON sd.discount_rule_id = dr.id
    WHERE sd.subscription_id = ?
  `).all(id);

  return {
    ...sub,
    can_be_paused: Boolean(sub.can_be_paused),
    can_be_closed_early: Boolean(sub.can_be_closed_early),
    auto_close_at_end: Boolean(sub.auto_close_at_end),
    lines,
    discounts
  };
}

function listSubscriptions(filter = {}) {
  const db = getDb();
  let sql = `
    SELECT s.*, bp.name AS plan_name, bp.interval_unit, bp.interval_count, p.full_name AS customer_name, p.email AS customer_email
    FROM subscriptions s
    JOIN billing_plans bp ON s.plan_id = bp.id
    JOIN profiles p ON s.customer_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (filter.customer_id) {
    sql += ' AND s.customer_id = ?';
    params.push(filter.customer_id);
  }
  if (filter.state) {
    sql += ' AND s.state = ?';
    params.push(filter.state);
  }

  sql += ' ORDER BY s.created_at DESC';
  const subs = db.prepare(sql).all(...params);
  return subs.map(s => getSubscriptionById(s.id));
}

module.exports = {
  generateSubscriptionNumber,
  calculateNextInvoiceDate,
  createSubscriptionFromTemplate,
  getSubscriptionById,
  listSubscriptions
};
