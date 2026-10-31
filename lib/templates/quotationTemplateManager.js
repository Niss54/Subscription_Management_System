const crypto = require('node:crypto');
const { getDb } = require('../db');

function createQuotationTemplate({ name, plan_id, validity_days = 30, payment_terms = 'Net 15', notes = '', lines = [] }) {
  const db = getDb();
  if (validity_days <= 0) {
    throw new Error("Validity days must be greater than zero.");
  }

  const templateId = crypto.randomUUID();

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO quotation_templates (id, name, plan_id, validity_days, payment_terms, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(templateId, name, plan_id, validity_days, payment_terms, notes);

    for (const line of lines) {
      if (line.default_quantity <= 0) {
        throw new Error("Default quantity must be greater than zero.");
      }
      const lineId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO quotation_template_lines (id, template_id, product_variant_id, default_quantity, tax_rule_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(lineId, templateId, line.product_variant_id, Number(line.default_quantity), line.tax_rule_id || null);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getQuotationTemplateById(templateId);
}

function getQuotationTemplateById(id) {
  const db = getDb();
  const template = db.prepare(`
    SELECT qt.*, bp.name AS plan_name, bp.interval_unit, bp.interval_count
    FROM quotation_templates qt
    JOIN billing_plans bp ON qt.plan_id = bp.id
    WHERE qt.id = ?
  `).get(id);

  if (!template) return null;

  const lines = db.prepare(`
    SELECT qtl.*, pv.variant_value, pv.price_extra, pv.sku, p.name AS product_name, p.base_sales_price, tr.rate AS tax_rate
    FROM quotation_template_lines qtl
    JOIN product_variants pv ON qtl.product_variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    LEFT JOIN tax_rules tr ON qtl.tax_rule_id = tr.id
    WHERE qtl.template_id = ?
  `).all(id);

  return {
    ...template,
    lines: lines.map(line => ({
      ...line,
      unit_price: Number((line.base_sales_price + line.price_extra).toFixed(4)),
      subtotal: Number(((line.base_sales_price + line.price_extra) * line.default_quantity).toFixed(4))
    }))
  };
}

function getAllQuotationTemplates() {
  const db = getDb();
  const templates = db.prepare(`
    SELECT qt.*, bp.name AS plan_name
    FROM quotation_templates qt
    JOIN billing_plans bp ON qt.plan_id = bp.id
    ORDER BY qt.created_at DESC
  `).all();

  return templates.map(t => getQuotationTemplateById(t.id));
}

function deleteQuotationTemplate(id) {
  const db = getDb();
  db.prepare('DELETE FROM quotation_templates WHERE id = ?').run(id);
  return { success: true };
}

module.exports = {
  createQuotationTemplate,
  getQuotationTemplateById,
  getAllQuotationTemplates,
  deleteQuotationTemplate
};
