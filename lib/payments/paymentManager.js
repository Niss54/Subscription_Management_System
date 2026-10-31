const crypto = require('node:crypto');
const { getDb } = require('../db');
const { getInvoiceById } = require('../billing/billingWorker');

const VALID_PAYMENT_METHODS = ['bank_transfer', 'credit_card', 'wire_transfer', 'cash', 'upi', 'check'];

function recordPayment({
  invoiceId,
  amount,
  paymentMethod,
  referenceNote = '',
  recordedByUserId,
  paymentDate = new Date().toISOString()
}) {
  const db = getDb();
  const invoice = getInvoiceById(invoiceId);
  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  // Payments are strictly restricted to confirmed invoices
  if (invoice.status !== 'confirmed') {
    throw new Error(`INVALID_INVOICE_STATE: Only confirmed invoices accept payments. Current status: ${invoice.status}.`);
  }

  const numAmount = Number(amount);
  if (numAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  // Prevent overpayment beyond outstanding balance
  const outstandingBalance = Number((invoice.amount_total - invoice.amount_paid).toFixed(4));
  if (numAmount > outstandingBalance) {
    throw new Error(`OVERPAYMENT_REJECTED: Payment of $${numAmount.toFixed(2)} exceeds outstanding balance of $${outstandingBalance.toFixed(2)}.`);
  }

  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new Error(`Invalid payment method: ${paymentMethod}. Valid: ${VALID_PAYMENT_METHODS.join(', ')}`);
  }

  const paymentId = crypto.randomUUID();
  const newAmountPaid = Number((invoice.amount_paid + numAmount).toFixed(4));
  const isFullyPaid = newAmountPaid >= invoice.amount_total;
  const newStatus = isFullyPaid ? 'paid' : 'confirmed';

  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Insert payment record
    db.prepare(`
      INSERT INTO payments (
        id, invoice_id, amount, payment_method, payment_date, reference_note, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(paymentId, invoiceId, numAmount, paymentMethod, paymentDate, referenceNote, recordedByUserId);

    // 2. Update invoice amount_paid and status
    db.prepare(`
      UPDATE invoices
      SET amount_paid = ?, status = ?
      WHERE id = ?
    `).run(newAmountPaid, newStatus, invoiceId);

    // 3. Insert audit log
    const auditId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO audit_logs (id, entity_id, entity_type, action, user_id, metadata)
      VALUES (?, ?, 'invoice', 'payment_recorded', ?, ?)
    `).run(
      auditId, invoiceId, recordedByUserId,
      JSON.stringify({ paymentId, amount: numAmount, method: paymentMethod, newStatus, newAmountPaid })
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    paymentId,
    invoiceId,
    amountRecorded: numAmount,
    amountPaidTotal: newAmountPaid,
    amountRemaining: Number(Math.max(0, invoice.amount_total - newAmountPaid).toFixed(4)),
    invoiceStatus: newStatus,
    isFullyPaid
  };
}

function getPaymentsForInvoice(invoiceId) {
  const db = getDb();
  return db.prepare(`
    SELECT p.*, prof.full_name AS recorded_by_name, prof.email AS recorded_by_email
    FROM payments p
    JOIN profiles prof ON p.recorded_by = prof.id
    WHERE p.invoice_id = ?
    ORDER BY p.payment_date ASC
  `).all(invoiceId);
}

module.exports = {
  VALID_PAYMENT_METHODS,
  recordPayment,
  getPaymentsForInvoice
};
