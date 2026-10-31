const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Set isolated test database
const TEST_DB = path.join(process.cwd(), 'test_phase1.db');
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
  getAllProducts,
  createBillingPlan,
  getBillingPlanById,
  createTaxRule
} = require('../lib/catalog/catalogManager');

test('Phase 1.1: Password Regex Complexity Validation', (t) => {
  // Must be >8 characters (>=9), 1 uppercase, 1 lowercase, 1 special character
  assert.throws(() => validatePasswordComplexity('Short1!'), /more than 8 characters/);
  assert.throws(() => validatePasswordComplexity('alllowercase1!'), /uppercase/);
  assert.throws(() => validatePasswordComplexity('ALLUPPERCASE1!'), /lowercase/);
  assert.throws(() => validatePasswordComplexity('NoSpecialChar123'), /special character/);
  
  // Valid passwords
  assert.doesNotThrow(() => validatePasswordComplexity('Brightloop2026!'));
  assert.doesNotThrow(() => validatePasswordComplexity('Admin@12345'));
});

test('Phase 1.2: User Registration, Hashing, and JWT Login', (t) => {
  const user = registerUser({
    email: 'testcustomer@brightloop.com',
    password: 'CustomerSecurePass1#',
    full_name: 'Test Customer',
    role: 'customer'
  });

  assert.strictEqual(user.email, 'testcustomer@brightloop.com');
  assert.strictEqual(user.role, 'customer');
  assert.ok(user.token);

  // Duplicate email throws
  assert.throws(() => {
    registerUser({
      email: 'testcustomer@brightloop.com',
      password: 'CustomerSecurePass1#',
      full_name: 'Duplicate'
    });
  }, /already registered/);

  // Login success
  const loginRes = loginUser({
    email: 'testcustomer@brightloop.com',
    password: 'CustomerSecurePass1#'
  });
  assert.strictEqual(loginRes.id, user.id);
  assert.ok(loginRes.token);

  // Wrong password fails
  assert.throws(() => {
    loginUser({
      email: 'testcustomer@brightloop.com',
      password: 'WrongPassword1#'
    });
  }, /Invalid email or password/);
});

test('Phase 1.3: Role Isolation & Admin Staff Provisioning', (t) => {
  const admin = registerUser({
    email: 'admin@brightloop.com',
    password: 'AdminSuperPass2026!',
    full_name: 'Global Administrator',
    role: 'admin'
  });

  const regularCustomer = registerUser({
    email: 'customer2@brightloop.com',
    password: 'CustomerPass2026!',
    full_name: 'Regular Customer',
    role: 'customer'
  });

  // Admin can provision staff
  const staff = createStaffAccount(admin.id, {
    email: 'staff1@brightloop.com',
    password: 'StaffMemberPass2026!',
    full_name: 'Internal Staff 1'
  });
  assert.strictEqual(staff.role, 'staff');

  // Customer cannot provision staff
  assert.throws(() => {
    createStaffAccount(regularCustomer.id, {
      email: 'hacker_staff@brightloop.com',
      password: 'HackerPass2026!',
      full_name: 'Hacker Staff'
    });
  }, /Forbidden: Only administrators/);
});

test('Phase 1.4: Single-Use 15-Minute Tokenized Password Reset', (t) => {
  const resetReq = requestPasswordReset('testcustomer@brightloop.com');
  assert.ok(resetReq.success);
  assert.ok(resetReq.resetToken);

  // Execute reset with new password
  const resetRes = resetPasswordWithToken(resetReq.resetToken, 'NewSecurePass2026#');
  assert.ok(resetRes.success);

  // Login with new password succeeds
  const loginRes = loginUser({
    email: 'testcustomer@brightloop.com',
    password: 'NewSecurePass2026#'
  });
  assert.ok(loginRes.token);

  // Re-using the same token fails (Single-Use Invariant)
  assert.throws(() => {
    resetPasswordWithToken(resetReq.resetToken, 'AnotherPass2026#');
  }, /invalid or has already been used/);
});

test('Phase 1.5: Product Brand Variant Surcharge (+560.00)', (t) => {
  const product = createProduct({
    name: 'Brightloop Cloud ERP',
    product_type: 'software',
    base_sales_price: 1200.0,
    cost_price: 400.0,
    notes: 'Flagship enterprise suite'
  });

  assert.strictEqual(product.base_sales_price, 1200.0);

  // Add standard variant (+0.0)
  addProductVariant({
    product_id: product.id,
    attribute_name: 'Brand',
    variant_value: 'Standard',
    price_extra: 0.0,
    sku: 'ERP-STD'
  });

  // Add Odoo Brand variant (+560.00)
  const odooVariant = addProductVariant({
    product_id: product.id,
    attribute_name: 'Brand',
    variant_value: 'Odoo Brand',
    price_extra: 560.0,
    sku: 'ERP-ODOO'
  });

  assert.strictEqual(odooVariant.price_extra, 560.0);

  const fetched = getProductById(product.id);
  assert.strictEqual(fetched.variants.length, 2);

  const odooItem = fetched.variants.find(v => v.variant_value === 'Odoo Brand');
  assert.strictEqual(odooItem.total_price, 1760.0); // 1200 + 560 = 1760
});

test('Phase 1.6: Billing Plans with Granular Policy Flags', (t) => {
  const plan = createBillingPlan({
    name: 'Enterprise Annual Tier',
    interval_unit: 'yearly',
    interval_count: 1,
    plan_price: 15000.0,
    min_quantity: 5,
    can_be_paused: false,
    can_be_renewed: true,
    can_be_closed_early: true,
    auto_close_at_end: true
  });

  assert.strictEqual(plan.interval_unit, 'yearly');
  assert.strictEqual(plan.can_be_paused, false);
  assert.strictEqual(plan.auto_close_at_end, true);

  const fetchedPlan = getBillingPlanById(plan.id);
  assert.strictEqual(fetchedPlan.can_be_paused, false);
});

test('Phase 1.7: Tax Rules by Category', (t) => {
  const tax = createTaxRule({
    name: 'Standard GST / VAT',
    rate: 18.0,
    applicable_category: 'software'
  });
  assert.strictEqual(tax.rate, 18.0);
  assert.strictEqual(tax.applicable_category, 'software');
});
