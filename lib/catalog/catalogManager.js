const crypto = require('node:crypto');
const { getDb } = require('../db');

// --- Products & Variants ---

function createProduct({ name, product_type, base_sales_price, cost_price = 0.0, notes = '' }) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO products (id, name, product_type, base_sales_price, cost_price, notes, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(id, name, product_type, Number(base_sales_price), Number(cost_price), notes);

  return getProductById(id);
}

function addProductVariant({ product_id, attribute_name, variant_value, price_extra = 0.0, sku }) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO product_variants (id, product_id, attribute_name, variant_value, price_extra, sku, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(id, product_id, attribute_name, variant_value, Number(price_extra), sku);

  return db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id);
}

function getProductById(id) {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return null;

  const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1').all(id);
  return {
    ...product,
    variants: variants.map(v => ({
      ...v,
      total_price: Number((product.base_sales_price + v.price_extra).toFixed(4))
    }))
  };
}

function getAllProducts() {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products WHERE is_active = 1').all();
  return products.map(p => {
    const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1').all(p.id);
    return {
      ...p,
      variants: variants.map(v => ({
        ...v,
        total_price: Number((p.base_sales_price + v.price_extra).toFixed(4))
      }))
    };
  });
}

// --- Billing Plans ---

function createBillingPlan({
  name,
  interval_unit,
  interval_count = 1,
  plan_price = 0.0,
  min_quantity = 1,
  available_from = null,
  available_to = null,
  can_be_paused = true,
  can_be_renewed = true,
  can_be_closed_early = true,
  auto_close_at_end = false
}) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO billing_plans (
      id, name, interval_unit, interval_count, plan_price, min_quantity,
      available_from, available_to, can_be_paused, can_be_renewed,
      can_be_closed_early, auto_close_at_end, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, name, interval_unit, interval_count, Number(plan_price), min_quantity,
    available_from, available_to, can_be_paused ? 1 : 0, can_be_renewed ? 1 : 0,
    can_be_closed_early ? 1 : 0, auto_close_at_end ? 1 : 0
  );

  return getBillingPlanById(id);
}

function getBillingPlanById(id) {
  const db = getDb();
  const plan = db.prepare('SELECT * FROM billing_plans WHERE id = ?').get(id);
  if (!plan) return null;
  return {
    ...plan,
    can_be_paused: Boolean(plan.can_be_paused),
    can_be_renewed: Boolean(plan.can_be_renewed),
    can_be_closed_early: Boolean(plan.can_be_closed_early),
    auto_close_at_end: Boolean(plan.auto_close_at_end),
    is_active: Boolean(plan.is_active)
  };
}

function getAllBillingPlans() {
  const db = getDb();
  const plans = db.prepare('SELECT * FROM billing_plans WHERE is_active = 1').all();
  return plans.map(plan => ({
    ...plan,
    can_be_paused: Boolean(plan.can_be_paused),
    can_be_renewed: Boolean(plan.can_be_renewed),
    can_be_closed_early: Boolean(plan.can_be_closed_early),
    auto_close_at_end: Boolean(plan.auto_close_at_end),
    is_active: Boolean(plan.is_active)
  }));
}

// --- Tax Rules ---

function createTaxRule({ name, rate, applicable_category = 'all' }) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO tax_rules (id, name, rate, applicable_category, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(id, name, Number(rate), applicable_category);

  return db.prepare('SELECT * FROM tax_rules WHERE id = ?').get(id);
}

function getAllTaxRules() {
  const db = getDb();
  return db.prepare('SELECT * FROM tax_rules WHERE is_active = 1').all();
}

module.exports = {
  createProduct,
  addProductVariant,
  getProductById,
  getAllProducts,
  createBillingPlan,
  getBillingPlanById,
  getAllBillingPlans,
  createTaxRule,
  getAllTaxRules
};
