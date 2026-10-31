const { getDb } = require('../db');
const { getSubscriptionById } = require('../subscriptions/subscriptionManager');

const VALID_TRANSITIONS = {
  draft: ['quotation', 'closed'],
  quotation: ['confirmed', 'closed'],
  confirmed: ['active', 'closed'],
  active: ['paused', 'closed'],
  paused: ['active', 'closed'],
  closed: [] // Terminal state
};

function validateTransition(currentState, targetState, context = {}) {
  if (!VALID_TRANSITIONS[currentState] || !VALID_TRANSITIONS[currentState].includes(targetState)) {
    return {
      allowed: false,
      reason: `Illegal transition from ${currentState} to ${targetState}.`
    };
  }

  // Guard 1: Expired quotation cannot be confirmed
  if (currentState === 'quotation' && targetState === 'confirmed' && context.isExpired) {
    return {
      allowed: false,
      reason: "Quotation has passed its validity date and cannot be confirmed."
    };
  }

  // Guard 2: Pausing when plan forbids it
  if (currentState === 'active' && targetState === 'paused' && context.canBePaused === false) {
    return {
      allowed: false,
      reason: "The selected billing plan does not permit pausing."
    };
  }

  // Guard 3: Closing early when plan forbids it
  if (currentState === 'active' && targetState === 'closed' && context.canBeClosedEarly === false) {
    return {
      allowed: false,
      reason: "The selected billing plan does not permit early closure."
    };
  }

  return { allowed: true };
}

function transitionSubscriptionState(subscriptionId, targetState, options = {}) {
  const db = getDb();
  const sub = getSubscriptionById(subscriptionId);
  if (!sub) {
    throw new Error("Subscription not found.");
  }

  const currentDateStr = options.currentDate || new Date().toISOString().split('T')[0];
  const isExpired = sub.expiry_date ? sub.expiry_date < currentDateStr : false;

  const validation = validateTransition(sub.state, targetState, {
    isExpired: options.isExpired !== undefined ? options.isExpired : isExpired,
    canBePaused: sub.can_be_paused,
    canBeClosedEarly: sub.can_be_closed_early
  });

  if (!validation.allowed) {
    throw new Error(validation.reason);
  }

  let pausedAtUpdate = sub.paused_at;
  let nextInvoiceDateUpdate = sub.next_invoice_date;

  // If transitioning to paused: set paused_at timestamp
  if (targetState === 'paused') {
    pausedAtUpdate = options.pausedAt || new Date().toISOString();
  }

  // If resuming from paused -> active: recalibrate next_invoice_date by elapsed pause duration
  if (sub.state === 'paused' && targetState === 'active') {
    if (sub.paused_at) {
      const pausedTime = new Date(sub.paused_at).getTime();
      const resumeTime = options.resumeTime ? new Date(options.resumeTime).getTime() : Date.now();
      const deltaMs = Math.max(0, resumeTime - pausedTime);
      const deltaDays = Math.ceil(deltaMs / (1000 * 60 * 60 * 24));

      if (deltaDays > 0 && sub.next_invoice_date) {
        const nextInvD = new Date(sub.next_invoice_date);
        nextInvD.setDate(nextInvD.getDate() + deltaDays);
        nextInvoiceDateUpdate = nextInvD.toISOString().split('T')[0];
      }
    }
    pausedAtUpdate = null; // Clear pause timestamp
  }

  db.prepare(`
    UPDATE subscriptions 
    SET state = ?, paused_at = ?, next_invoice_date = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(targetState, pausedAtUpdate, nextInvoiceDateUpdate, subscriptionId);

  return getSubscriptionById(subscriptionId);
}

module.exports = {
  VALID_TRANSITIONS,
  validateTransition,
  transitionSubscriptionState
};
