const { getDb } = require('../db');
const { getSubscriptionById, listSubscriptions } = require('../subscriptions/subscriptionManager');
const { getInvoiceById, listInvoices } = require('../billing/billingWorker');

function getCustomerPortalData(authenticatedUserId) {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(authenticatedUserId);
  if (!profile) {
    throw new Error("User profile not found.");
  }

  // Tenant Isolation: If role is customer, strictly filter by customer_id
  const filter = profile.role === 'customer' ? { customer_id: authenticatedUserId } : {};

  const subscriptions = listSubscriptions(filter);
  const invoices = listInvoices(filter);

  return {
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role
    },
    subscriptions,
    invoices
  };
}

function verifyCustomerAccessToInvoice(authenticatedUserId, invoiceId) {
  const db = getDb();
  const profile = db.prepare('SELECT role FROM profiles WHERE id = ?').get(authenticatedUserId);
  if (!profile) throw new Error("Unauthorized.");

  const invoice = getInvoiceById(invoiceId);
  if (!invoice) throw new Error("Invoice not found.");

  if (profile.role === 'customer' && invoice.customer_id !== authenticatedUserId) {
    throw new Error("403_FORBIDDEN: Tenant Isolation Enforced. You cannot access another customer's invoice.");
  }

  return invoice;
}

module.exports = {
  getCustomerPortalData,
  verifyCustomerAccessToInvoice
};
