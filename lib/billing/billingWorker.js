const crypto = require('node:crypto');
const { getDb, nextSequence } = require('../db');
const { calculateLineTax, resolveTaxRateForProduct } = require('../pricing/taxCalculator');
const { evaluateDiscountApplicability, calculateDiscountAmount, consumeDiscountUseAtomically } = require('../pricing/discountEngine');
const { calculateNextInvoiceDate, getSubscriptionById } = require('../subscriptions/subscriptionManager');

function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const seq = nextSequence('invoice_seq');
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}

function generateIdempotencyKey(subId, periodStart, periodEnd) {
  return crypto.createHash('sha256').update(`${subId}:${periodStart}:${periodEnd}`).digest('hex');
}

function executeMassBillingRun({ executionDate = new Date().toISOString().split('T')[0] } = {}) {
  const db = getDb();
  
  // Find all active subscriptions due for billing on or before executionDate
  const dueSubscriptions = db.prepare(`
    SELECT s.*, bp.interval_unit, bp.interval_count
    FROM subscriptions s
    JOIN billing_plans bp ON s.plan_id = bp.id
    WHERE s.state = 'active' AND s.next_invoice_date <= ?
  `).all(executionDate);

  const results = {
    totalDue: dueSubscriptions.length,
    invoicesGenerated: 0,
    duplicatesSkipped: 0,
    invoiceIds: []
  };

  for (const sub of dueSubscriptions) {
    const periodStart = sub.next_invoice_date;
    const periodEnd = calculateNextInvoiceDate(periodStart, sub.interval_unit, sub.interval_count);
    const idempotencyKey = generateIdempotencyKey(sub.id, periodStart, periodEnd);

    // Double-Billing Guard: check if an invoice with this idempotency key already exists
    const existing = db.prepare('SELECT id FROM invoices WHERE idempotency_key = ?').get(idempotencyKey);
    if (existing) {
      results.duplicatesSkipped++;
      continue;
    }

    const subDetails = getSubscriptionById(sub.id);
    if (!subDetails || !subDetails.lines || subDetails.lines.length === 0) {
      continue;
    }

    // Due date defaults to 15 days from invoice date (Net 15) or payment terms
    const invDateObj = new Date(executionDate);
    const dueDateObj = new Date(invDateObj);
    dueDateObj.setDate(dueDateObj.getDate() + 15);
    const dueDateStr = dueDateObj.toISOString().split('T')[0];

    const invoiceId = crypto.randomUUID();
    const invoiceNumber = generateInvoiceNumber();

    // Calculate untaxed subtotal & quantity
    let amountUntaxed = 0;
    let totalQuantity = 0;
    for (const line of subDetails.lines) {
      amountUntaxed += line.subtotal;
      totalQuantity += line.quantity;
    }

    // Evaluate discounts
    let totalDiscount = 0;
    const lineDiscounts = new Map();

    if (subDetails.discounts && subDetails.discounts.length > 0) {
      for (const d of subDetails.discounts) {
        const check = evaluateDiscountApplicability(d, {
          untaxedSubtotal: amountUntaxed,
          totalQuantity,
          currentDateStr: executionDate
        });

        if (check.applicable) {
          if (d.scope === 'subscription') {
            // Apply subscription discount proportionally across lines
            const discVal = calculateDiscountAmount(d, amountUntaxed);
            totalDiscount += discVal;
            for (const line of subDetails.lines) {
              const proportion = line.subtotal / amountUntaxed;
              const lineDisc = Number((discVal * proportion).toFixed(4));
              lineDiscounts.set(line.id, (lineDiscounts.get(line.id) || 0) + lineDisc);
            }
          } else if (d.scope === 'product' && d.target_product_id) {
            // Apply only to lines matching target product
            for (const line of subDetails.lines) {
              if (line.product_id === d.target_product_id) {
                const lineDisc = calculateDiscountAmount(d, line.subtotal);
                totalDiscount += lineDisc;
                lineDiscounts.set(line.id, (lineDiscounts.get(line.id) || 0) + lineDisc);
              }
            }
          }
        }
      }
    }

    // Calculate taxes strictly on net discounted lines
    let totalTax = 0;
    const processedLines = [];

    for (const line of subDetails.lines) {
      const lineDisc = lineDiscounts.get(line.id) || 0;
      const netTaxable = Math.max(0, line.subtotal - lineDisc);
      const taxRate = (line.tax_rate !== undefined && line.tax_rate !== null)
        ? line.tax_rate
        : (resolveTaxRateForProduct(line.product_type, line.tax_rule_id) || 0.0);
      const lineTax = calculateLineTax(netTaxable, taxRate);
      totalTax += lineTax;

      processedLines.push({
        variant_id: line.product_variant_id,
        description: `${line.product_name} (${line.variant_value})`,
        quantity: line.quantity,
        unit_price: line.unit_price,
        tax_rate: taxRate,
        discount_amount: lineDisc,
        line_subtotal: Number((netTaxable + lineTax).toFixed(4))
      });
    }

    const amountTotal = Number((amountUntaxed - totalDiscount + totalTax).toFixed(4));

    // Atomically persist invoice & advance subscription next_invoice_date
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO invoices (
          id, invoice_number, subscription_id, customer_id, status,
          invoice_date, due_date, billing_period_start, billing_period_end,
          amount_untaxed, amount_discount, amount_tax, amount_total,
          amount_paid, idempotency_key
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?)
      `).run(
        invoiceId, invoiceNumber, sub.id, sub.customer_id,
        executionDate, dueDateStr, periodStart, periodEnd,
        amountUntaxed, totalDiscount, totalTax, amountTotal, idempotencyKey
      );

      for (const pl of processedLines) {
        const lineId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO invoice_lines (
            id, invoice_id, product_variant_id, description,
            quantity, unit_price, tax_rate, discount_amount, line_subtotal
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          lineId, invoiceId, pl.variant_id, pl.description,
          pl.quantity, pl.unit_price, pl.tax_rate, pl.discount_amount, pl.line_subtotal
        );
      }

      // Advance subscription next_invoice_date to periodEnd
      db.prepare(`
        UPDATE subscriptions 
        SET next_invoice_date = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(periodEnd, sub.id);

      db.exec('COMMIT');
      results.invoicesGenerated++;
      results.invoiceIds.push(invoiceId);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return results;
}

function getInvoiceById(id) {
  const db = getDb();
  const inv = db.prepare(`
    SELECT i.*, p.full_name AS customer_name, p.email AS customer_email, s.subscription_number
    FROM invoices i
    JOIN profiles p ON i.customer_id = p.id
    JOIN subscriptions s ON i.subscription_id = s.id
    WHERE i.id = ?
  `).get(id);

  if (!inv) return null;

  const lines = db.prepare(`
    SELECT il.*, pv.variant_value, pv.sku
    FROM invoice_lines il
    JOIN product_variants pv ON il.product_variant_id = pv.id
    WHERE il.invoice_id = ?
  `).all(id);

  const payments = db.prepare(`
    SELECT pay.*, prof.full_name AS recorded_by_name
    FROM payments pay
    JOIN profiles prof ON pay.recorded_by = prof.id
    WHERE pay.invoice_id = ?
    ORDER BY pay.payment_date ASC
  `).all(id);

  return {
    ...inv,
    amount_due: Number(Math.max(0, inv.amount_total - inv.amount_paid).toFixed(4)),
    lines,
    payments
  };
}

function listInvoices(filter = {}) {
  const db = getDb();
  let sql = `
    SELECT i.*, p.full_name AS customer_name, p.email AS customer_email, s.subscription_number
    FROM invoices i
    JOIN profiles p ON i.customer_id = p.id
    JOIN subscriptions s ON i.subscription_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (filter.customer_id) {
    sql += ' AND i.customer_id = ?';
    params.push(filter.customer_id);
  }
  if (filter.status) {
    sql += ' AND i.status = ?';
    params.push(filter.status);
  }
  if (filter.subscription_id) {
    sql += ' AND i.subscription_id = ?';
    params.push(filter.subscription_id);
  }

  sql += ' ORDER BY i.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => getInvoiceById(r.id));
}

function confirmInvoice(invoiceId) {
  const db = getDb();
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== 'draft') {
    throw new Error(`Cannot confirm an invoice in status ${invoice.status}.`);
  }

  // Atomically increment discount usage for any discounts on this subscription
  const sub = getSubscriptionById(invoice.subscription_id);
  if (sub && sub.discounts) {
    for (const d of sub.discounts) {
      try {
        consumeDiscountUseAtomically(d.id || d.discount_rule_id);
      } catch (err) {
        // If discount expired/exhausted at confirm time, log and proceed
      }
    }
  }

  db.prepare("UPDATE invoices SET status = 'confirmed' WHERE id = ?").run(invoiceId);
  return getInvoiceById(invoiceId);
}

function cancelInvoice(invoiceId) {
  const db = getDb();
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.payments && invoice.payments.length > 0) {
    throw new Error("Cannot cancel an invoice with recorded payments.");
  }
  db.prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ?").run(invoiceId);
  return getInvoiceById(invoiceId);
}

module.exports = {
  generateInvoiceNumber,
  generateIdempotencyKey,
  executeMassBillingRun,
  getInvoiceById,
  listInvoices,
  confirmInvoice,
  cancelInvoice
};
