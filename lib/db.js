const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Ensure db file location
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'subscriptions.db');

let _db = null;

function getDb() {
  if (_db) return _db;

  _db = new DatabaseSync(DB_PATH);
  
  // Enable WAL mode and foreign keys for high performance and integrity
  _db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    -- 1. Profiles & RBAC
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'customer')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. Single-Use Password Reset Tokens
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. Tax Rules
    CREATE TABLE IF NOT EXISTS tax_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rate REAL NOT NULL CHECK (rate >= 0),
      applicable_category TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. Product Catalog & Brand Variants
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      product_type TEXT NOT NULL,
      base_sales_price REAL NOT NULL CHECK (base_sales_price >= 0),
      cost_price REAL NOT NULL DEFAULT 0.0,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      attribute_name TEXT NOT NULL,
      variant_value TEXT NOT NULL,
      price_extra REAL NOT NULL DEFAULT 0.0,
      sku TEXT UNIQUE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- 5. Billing Plans with Policy Controls
    CREATE TABLE IF NOT EXISTS billing_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      interval_unit TEXT NOT NULL CHECK (interval_unit IN ('daily', 'weekly', 'monthly', 'yearly')),
      interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count >= 1),
      plan_price REAL NOT NULL DEFAULT 0.0,
      min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
      available_from TEXT,
      available_to TEXT,
      can_be_paused INTEGER NOT NULL DEFAULT 1,
      can_be_renewed INTEGER NOT NULL DEFAULT 1,
      can_be_closed_early INTEGER NOT NULL DEFAULT 1,
      auto_close_at_end INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 6. Quotation Templates
    CREATE TABLE IF NOT EXISTS quotation_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plan_id TEXT NOT NULL REFERENCES billing_plans(id),
      validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days > 0),
      payment_terms TEXT NOT NULL DEFAULT 'Net 15',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotation_template_lines (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
      product_variant_id TEXT NOT NULL REFERENCES product_variants(id),
      default_quantity REAL NOT NULL DEFAULT 1 CHECK (default_quantity > 0),
      tax_rule_id TEXT REFERENCES tax_rules(id)
    );

    -- 7. Sequences & Counters
    CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      current_val INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO sequences (name, current_val) VALUES ('subscription_seq', 0);
    INSERT OR IGNORE INTO sequences (name, current_val) VALUES ('invoice_seq', 0);

    -- 8. Subscriptions
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      subscription_number TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL REFERENCES profiles(id),
      plan_id TEXT NOT NULL REFERENCES billing_plans(id),
      state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed')),
      start_date TEXT NOT NULL DEFAULT (date('now')),
      expiry_date TEXT,
      next_invoice_date TEXT,
      payment_terms TEXT NOT NULL DEFAULT 'Net 15',
      paused_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscription_lines (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      product_variant_id TEXT NOT NULL REFERENCES product_variants(id),
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      tax_rule_id TEXT REFERENCES tax_rules(id),
      subtotal REAL NOT NULL
    );

    -- 9. Dynamic Discount Rules
    CREATE TABLE IF NOT EXISTS discount_rules (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed')),
      discount_value REAL NOT NULL CHECK (discount_value > 0),
      min_purchase_amount REAL DEFAULT 0.0,
      min_quantity REAL DEFAULT 0.0,
      start_date TEXT,
      end_date TEXT,
      max_uses INTEGER,
      current_uses INTEGER NOT NULL DEFAULT 0,
      scope TEXT NOT NULL DEFAULT 'subscription' CHECK(scope IN ('subscription', 'product')),
      target_product_id TEXT REFERENCES products(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscription_discounts (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      discount_rule_id TEXT NOT NULL REFERENCES discount_rules(id),
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(subscription_id, discount_rule_id)
    );

    -- 10. Invoices
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
      customer_id TEXT NOT NULL REFERENCES profiles(id),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'confirmed', 'paid', 'cancelled')),
      invoice_date TEXT NOT NULL DEFAULT (date('now')),
      due_date TEXT NOT NULL,
      billing_period_start TEXT NOT NULL,
      billing_period_end TEXT NOT NULL,
      amount_untaxed REAL NOT NULL,
      amount_discount REAL NOT NULL DEFAULT 0.0,
      amount_tax REAL NOT NULL DEFAULT 0.0,
      amount_total REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0.0,
      idempotency_key TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_variant_id TEXT NOT NULL REFERENCES product_variants(id),
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      tax_rate REAL NOT NULL DEFAULT 0.0,
      discount_amount REAL NOT NULL DEFAULT 0.0,
      line_subtotal REAL NOT NULL
    );

    -- 11. Payments & Settlement
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id),
      amount REAL NOT NULL CHECK (amount > 0),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('bank_transfer', 'credit_card', 'wire_transfer', 'cash', 'upi', 'check')),
      payment_date TEXT NOT NULL DEFAULT (datetime('now')),
      reference_note TEXT,
      recorded_by TEXT NOT NULL REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 12. Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT REFERENCES profiles(id),
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Performance indexes for sub-2s query latency SLA
    CREATE INDEX IF NOT EXISTS idx_subs_state_plan ON subscriptions(state, plan_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices(status, due_date);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
    CREATE INDEX IF NOT EXISTS idx_inv_sub_id ON invoices(subscription_id);
  `);
}

function nextSequence(seqName) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT current_val FROM sequences WHERE name = ?').get(seqName);
    const nextVal = (row ? row.current_val : 0) + 1;
    db.prepare('UPDATE sequences SET current_val = ? WHERE name = ?').run(nextVal, seqName);
    db.exec('COMMIT');
    return nextVal;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  getDb,
  nextSequence
};
