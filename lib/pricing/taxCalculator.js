const { getDb } = require('../db');

function calculateLineTax(taxableBase, taxRate) {
  if (!taxRate || taxRate <= 0) return 0;
  return Number(((taxableBase * taxRate) / 100).toFixed(4));
}

function resolveTaxRateForProduct(productType, taxRuleId = null) {
  const db = getDb();
  if (taxRuleId) {
    const rule = db.prepare('SELECT rate FROM tax_rules WHERE id = ? AND is_active = 1').get(taxRuleId);
    if (rule) return rule.rate;
  }

  // Find tax rule matching category or 'all'
  const rule = db.prepare(`
    SELECT rate FROM tax_rules 
    WHERE is_active = 1 AND (applicable_category = ? OR applicable_category = 'all')
    ORDER BY CASE WHEN applicable_category = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).get(productType, productType);

  return rule ? rule.rate : 0.0;
}

module.exports = {
  calculateLineTax,
  resolveTaxRateForProduct
};
