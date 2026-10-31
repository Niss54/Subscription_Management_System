const crypto = require('node:crypto');
const { getDb } = require('../db');

function createDiscountRule({
  code,
  discount_type,
  discount_value,
  min_purchase_amount = 0.0,
  min_quantity = 0.0,
  start_date = null,
  end_date = null,
  max_uses = null,
  scope = 'subscription',
  target_product_id = null
}) {
  const db = getDb();
  if (discount_value <= 0) {
    throw new Error("Discount value must be greater than zero.");
  }

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO discount_rules (
      id, code, discount_type, discount_value, min_purchase_amount,
      min_quantity, start_date, end_date, max_uses, current_uses,
      scope, target_product_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)
  `).run(
    id, code.toUpperCase(), discount_type, Number(discount_value),
    Number(min_purchase_amount), Number(min_quantity), start_date,
    end_date, max_uses ? Number(max_uses) : null, scope, target_product_id
  );

  return getDiscountRuleById(id);
}

function getDiscountRuleById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(id);
}

function getDiscountRuleByCode(code) {
  const db = getDb();
  return db.prepare('SELECT * FROM discount_rules WHERE code = ? AND is_active = 1').get(code.toUpperCase());
}

function attachDiscountToSubscription(subscriptionId, discountRuleId) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT OR IGNORE INTO subscription_discounts (id, subscription_id, discount_rule_id)
    VALUES (?, ?, ?)
  `).run(id, subscriptionId, discountRuleId);
  return { success: true };
}

function evaluateDiscountApplicability(rule, { untaxedSubtotal, totalQuantity, currentDateStr, targetProductId = null }) {
  if (!rule || !rule.is_active) {
    return { applicable: false, reason: "Discount rule is inactive or invalid." };
  }

  // Check usage limit
  if (rule.max_uses !== null && rule.current_uses >= rule.max_uses) {
    return { applicable: false, reason: "DISCOUNT_MAX_USES_EXHAUSTED" };
  }

  // Check date bounds
  if (rule.start_date && currentDateStr < rule.start_date) {
    return { applicable: false, reason: "Discount has not started yet." };
  }
  if (rule.end_date && currentDateStr > rule.end_date) {
    return { applicable: false, reason: "DISCOUNT_EXPIRED" };
  }

  // Check threshold requirements
  if (rule.min_purchase_amount > 0 && untaxedSubtotal < rule.min_purchase_amount) {
    return { applicable: false, reason: `Minimum purchase of $${rule.min_purchase_amount} required.` };
  }
  if (rule.min_quantity > 0 && totalQuantity < rule.min_quantity) {
    return { applicable: false, reason: `Minimum quantity of ${rule.min_quantity} required.` };
  }

  return { applicable: true };
}

function calculateDiscountAmount(rule, lineSubtotal) {
  if (rule.discount_type === 'percentage') {
    return Number(((lineSubtotal * rule.discount_value) / 100).toFixed(4));
  } else {
    // Fixed amount (cannot exceed line subtotal)
    return Number(Math.min(rule.discount_value, lineSubtotal).toFixed(4));
  }
}

function consumeDiscountUseAtomically(discountRuleId) {
  const db = getDb();
  const res = db.prepare(`
    UPDATE discount_rules
    SET current_uses = current_uses + 1
    WHERE id = ? AND (max_uses IS NULL OR current_uses < max_uses)
  `).run(discountRuleId);

  if (res.changes === 0) {
    throw new Error("DISCOUNT_MAX_USES_EXHAUSTED");
  }
  return true;
}

module.exports = {
  createDiscountRule,
  getDiscountRuleById,
  getDiscountRuleByCode,
  attachDiscountToSubscription,
  evaluateDiscountApplicability,
  calculateDiscountAmount,
  consumeDiscountUseAtomically
};
