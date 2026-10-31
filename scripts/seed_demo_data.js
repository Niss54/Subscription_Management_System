const crypto = require('node:crypto');
const { getDb } = require('../lib/db');
const { hashPassword } = require('../lib/auth/authManager');
const { generateInvoiceNumber, generateIdempotencyKey } = require('../lib/billing/billingWorker');
const { generateSubscriptionNumber } = require('../lib/subscriptions/subscriptionManager');

async function seedDatabase() {
  const startTime = performance.now();
  const db = getDb();
  console.log("🚀 Starting 500+ Record Database Seeder for Brightloop Software Platform...");

  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Seed Tax Rules
    const taxSoftwareId = crypto.randomUUID();
    const taxServiceId = crypto.randomUUID();

    db.prepare(`
      INSERT OR REPLACE INTO tax_rules (id, name, rate, applicable_category, is_active)
      VALUES (?, 'GST Software 18%', 18.0, 'software', 1)
    `).run(taxSoftwareId);

    db.prepare(`
      INSERT OR REPLACE INTO tax_rules (id, name, rate, applicable_category, is_active)
      VALUES (?, 'Zero Tax Services 0%', 0.0, 'service', 1)
    `).run(taxServiceId);

    // 2. Seed Users
    const adminId = crypto.randomUUID();
    const staff1Id = crypto.randomUUID();
    const staff2Id = crypto.randomUUID();

    const passHash = hashPassword('Brightloop2026!');

    db.prepare(`
      INSERT OR REPLACE INTO profiles (id, email, full_name, password_hash, role, is_active)
      VALUES (?, 'admin@brightloop.com', 'Alex Admin (Operations)', ?, 'admin', 1)
    `).run(adminId, passHash);

    db.prepare(`
      INSERT OR REPLACE INTO profiles (id, email, full_name, password_hash, role, is_active)
      VALUES (?, 'staff1@brightloop.com', 'Sarah Staff (Sales Rep)', ?, 'staff', 1)
    `).run(staff1Id, passHash);

    db.prepare(`
      INSERT OR REPLACE INTO profiles (id, email, full_name, password_hash, role, is_active)
      VALUES (?, 'staff2@brightloop.com', 'Sam Staff (Support Desk)', ?, 'staff', 1)
    `).run(staff2Id, passHash);

    const customerIds = [];
    for (let i = 1; i <= 20; i++) {
      const cId = crypto.randomUUID();
      db.prepare(`
        INSERT OR REPLACE INTO profiles (id, email, full_name, password_hash, role, is_active)
        VALUES (?, ?, ?, ?, 'customer', 1)
      `).run(cId, `customer${i}@company${i}.com`, `Client ${i} Enterprise Ltd`, passHash);
      customerIds.push(cId);
    }

    // 3. Seed Products & Variants
    const p1Id = crypto.randomUUID();
    db.prepare(`
      INSERT OR REPLACE INTO products (id, name, product_type, base_sales_price, cost_price, notes)
      VALUES (?, 'Brightloop Enterprise Cloud', 'software', 1200.0, 400.0, 'Flagship enterprise tier')
    `).run(p1Id);

    const varOdooId = crypto.randomUUID();
    const varStdId = crypto.randomUUID();

    db.prepare(`
      INSERT OR REPLACE INTO product_variants (id, product_id, attribute_name, variant_value, price_extra, sku)
      VALUES (?, ?, 'Brand', 'Odoo Brand', 560.0, 'ERP-ODOO-PRO')
    `).run(varOdooId, p1Id);

    db.prepare(`
      INSERT OR REPLACE INTO product_variants (id, product_id, attribute_name, variant_value, price_extra, sku)
      VALUES (?, ?, 'Brand', 'Standard', 0.0, 'ERP-STD-PRO')
    `).run(varStdId, p1Id);

    const p2Id = crypto.randomUUID();
    db.prepare(`
      INSERT OR REPLACE INTO products (id, name, product_type, base_sales_price, cost_price, notes)
      VALUES (?, 'AI Analytics Co-Pilot', 'software', 250.0, 50.0, 'Automated insights add-on')
    `).run(p2Id);

    const varAiId = crypto.randomUUID();
    db.prepare(`
      INSERT OR REPLACE INTO product_variants (id, product_id, attribute_name, variant_value, price_extra, sku)
      VALUES (?, ?, 'Tier', 'Standard Addon', 0.0, 'ADDON-AI-01')
    `).run(varAiId, p2Id);

    // 4. Seed Billing Plans
    const planMonthlyId = crypto.randomUUID();
    const planYearlyId = crypto.randomUUID();
    const planWeeklyId = crypto.randomUUID();

    db.prepare(`
      INSERT OR REPLACE INTO billing_plans (id, name, interval_unit, interval_count, plan_price, can_be_paused, can_be_renewed, can_be_closed_early, auto_close_at_end)
      VALUES (?, 'Monthly Commercial Plan', 'monthly', 1, 1200.0, 1, 1, 1, 0)
    `).run(planMonthlyId);

    db.prepare(`
      INSERT OR REPLACE INTO billing_plans (id, name, interval_unit, interval_count, plan_price, can_be_paused, can_be_renewed, can_be_closed_early, auto_close_at_end)
      VALUES (?, 'Annual Enterprise Plan', 'yearly', 1, 12000.0, 1, 1, 1, 1)
    `).run(planYearlyId);

    db.prepare(`
      INSERT OR REPLACE INTO billing_plans (id, name, interval_unit, interval_count, plan_price, can_be_paused, can_be_renewed, can_be_closed_early, auto_close_at_end)
      VALUES (?, 'Weekly Sprint Plan', 'weekly', 1, 300.0, 0, 1, 1, 0)
    `).run(planWeeklyId);

    // 5. Seed Discount Rules
    const disc1Id = crypto.randomUUID();
    db.prepare(`
      INSERT OR REPLACE INTO discount_rules (id, code, discount_type, discount_value, min_purchase_amount, scope, is_active)
      VALUES (?, 'WELCOME20', 'percentage', 20.0, 500.0, 'subscription', 1)
    `).run(disc1Id);

    // 6. Generate 520+ Subscriptions
    console.log("📦 Generating 520+ subscriptions across states...");
    const states = ['active', 'active', 'active', 'confirmed', 'quotation', 'draft', 'paused', 'closed'];
    const plans = [planMonthlyId, planYearlyId, planWeeklyId];

    const insertSubStmt = db.prepare(`
      INSERT INTO subscriptions (
        id, subscription_number, customer_id, plan_id, state,
        start_date, expiry_date, next_invoice_date, payment_terms, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Net 15', ?)
    `);

    const insertLineStmt = db.prepare(`
      INSERT INTO subscription_lines (
        id, subscription_id, product_variant_id, quantity, unit_price, tax_rule_id, subtotal
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const subIds = [];

    for (let i = 1; i <= 520; i++) {
      const sId = crypto.randomUUID();
      const subNum = `SUB-2026-${String(i).padStart(4, '0')}`;
      const custId = customerIds[i % customerIds.length];
      const planId = plans[i % plans.length];
      const state = states[i % states.length];

      const startD = '2026-01-01';
      const expiryD = '2026-12-31';
      const nextInvD = '2026-11-01';

      insertSubStmt.run(sId, subNum, custId, planId, state, startD, expiryD, nextInvD, `Seeded contract #${i}`);
      subIds.push({ id: sId, customer_id: custId, state });

      // Add lines
      const line1Id = crypto.randomUUID();
      insertLineStmt.run(line1Id, sId, varOdooId, 1, 1760.0, taxSoftwareId, 1760.0);

      if (i % 2 === 0) {
        const line2Id = crypto.randomUUID();
        insertLineStmt.run(line2Id, sId, varAiId, 2, 250.0, taxSoftwareId, 500.0);
      }
    }

    // 7. Seed Invoices across Overdue Aging Buckets
    console.log("💰 Generating invoices with 1-30, 31-60, 61-90, 90+ day overdue aging...");
    const insertInvStmt = db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, subscription_id, customer_id, status,
        invoice_date, due_date, billing_period_start, billing_period_end,
        amount_untaxed, amount_discount, amount_tax, amount_total, amount_paid,
        idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPayStmt = db.prepare(`
      INSERT INTO payments (
        id, invoice_id, amount, payment_method, payment_date, reference_note, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Create 120 invoices: Some paid, some overdue in different tiers
    const overdueDueDates = [
      '2026-10-15', // 1-30 days overdue
      '2026-09-15', // 31-60 days overdue
      '2026-08-15', // 61-90 days overdue
      '2026-06-01'  // 90+ days overdue
    ];

    for (let j = 1; j <= 120; j++) {
      const invId = crypto.randomUUID();
      const invNum = `INV-2026-${String(j).padStart(4, '0')}`;
      const sub = subIds[j % subIds.length];
      const dueDate = overdueDueDates[j % overdueDueDates.length];
      const isPaid = j % 3 === 0;
      const status = isPaid ? 'paid' : 'confirmed';
      const amountUntaxed = 2260.0;
      const amountTax = 406.8;
      const amountTotal = 2666.8;
      const amountPaid = isPaid ? 2666.8 : (j % 2 === 0 ? 1000.0 : 0.0);
      const idempotencyKey = crypto.createHash('sha256').update(`seed-inv-${j}`).digest('hex');

      insertInvStmt.run(
        invId, invNum, sub.id, sub.customer_id, status,
        '2026-05-01', dueDate, '2026-05-01', '2026-05-31',
        amountUntaxed, 0.0, amountTax, amountTotal, amountPaid,
        idempotencyKey
      );

      if (amountPaid > 0) {
        const payId = crypto.randomUUID();
        insertPayStmt.run(
          payId, invId, amountPaid, 'bank_transfer',
          '2026-10-20T10:00:00Z', `Wire Ref #SEED-${j}`, staff1Id
        );
      }
    }

    db.exec('COMMIT');
    const elapsedMs = (performance.now() - startTime).toFixed(2);
    console.log(`✅ Database seeding completed successfully in ${elapsedMs}ms!`);
    console.log(`📊 Total Subscriptions: 520+ | Total Invoices: 120+ | Total Users: 23`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error("❌ Seeding failed:", err);
    throw err;
  }
}

if (require.main === module) {
  seedDatabase().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedDatabase };
