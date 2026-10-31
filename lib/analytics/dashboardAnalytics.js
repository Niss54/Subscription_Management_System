const { getDb } = require('../db');

function getOverdueAgingAnalysis(asOfDateStr = new Date().toISOString().split('T')[0]) {
  const db = getDb();
  
  const rows = db.prepare(`
    SELECT 
      id,
      invoice_number,
      customer_id,
      due_date,
      amount_total,
      amount_paid,
      (amount_total - amount_paid) AS unpaid_amount,
      CAST((julianday(?) - julianday(due_date)) AS INTEGER) AS days_overdue
    FROM invoices
    WHERE status = 'confirmed' AND due_date < ?
  `).all(asOfDateStr, asOfDateStr);

  const buckets = {
    '1-30 Days': { count: 0, total_unpaid: 0, invoice_ids: [] },
    '31-60 Days': { count: 0, total_unpaid: 0, invoice_ids: [] },
    '61-90 Days': { count: 0, total_unpaid: 0, invoice_ids: [] },
    '90+ Days': { count: 0, total_unpaid: 0, invoice_ids: [] }
  };

  let totalOverdue = 0;

  for (const r of rows) {
    const days = r.days_overdue;
    const unpaid = Number(r.unpaid_amount.toFixed(4));
    totalOverdue += unpaid;

    if (days >= 1 && days <= 30) {
      buckets['1-30 Days'].count++;
      buckets['1-30 Days'].total_unpaid = Number((buckets['1-30 Days'].total_unpaid + unpaid).toFixed(2));
      buckets['1-30 Days'].invoice_ids.push(r.id);
    } else if (days >= 31 && days <= 60) {
      buckets['31-60 Days'].count++;
      buckets['31-60 Days'].total_unpaid = Number((buckets['31-60 Days'].total_unpaid + unpaid).toFixed(2));
      buckets['31-60 Days'].invoice_ids.push(r.id);
    } else if (days >= 61 && days <= 90) {
      buckets['61-90 Days'].count++;
      buckets['61-90 Days'].total_unpaid = Number((buckets['61-90 Days'].total_unpaid + unpaid).toFixed(2));
      buckets['61-90 Days'].invoice_ids.push(r.id);
    } else if (days > 90) {
      buckets['90+ Days'].count++;
      buckets['90+ Days'].total_unpaid = Number((buckets['90+ Days'].total_unpaid + unpaid).toFixed(2));
      buckets['90+ Days'].invoice_ids.push(r.id);
    }
  }

  return {
    asOfDate: asOfDateStr,
    totalOverdueInvoices: rows.length,
    totalOverdueDebt: Number(totalOverdue.toFixed(2)),
    agingBuckets: buckets
  };
}

function getExecutiveFinancialDashboard(asOfDateStr = new Date().toISOString().split('T')[0]) {
  const startTime = performance.now();
  const db = getDb();

  // 1. MRR Calculation across all active subscriptions
  const activeSubs = db.prepare(`
    SELECT s.id, bp.interval_unit, bp.interval_count,
           COALESCE(SUM(sl.subtotal), 0) AS total_subscription_value
    FROM subscriptions s
    JOIN billing_plans bp ON s.plan_id = bp.id
    LEFT JOIN subscription_lines sl ON sl.subscription_id = s.id
    WHERE s.state = 'active'
    GROUP BY s.id, bp.interval_unit, bp.interval_count
  `).all();

  let totalMRR = 0;
  for (const sub of activeSubs) {
    const val = sub.total_subscription_value;
    switch (sub.interval_unit) {
      case 'daily':
        totalMRR += (val * 30.4375);
        break;
      case 'weekly':
        totalMRR += (val * 4.348);
        break;
      case 'monthly':
        totalMRR += (val / sub.interval_count);
        break;
      case 'yearly':
        totalMRR += (val / (12 * sub.interval_count));
        break;
    }
  }

  const mrrRounded = Number(totalMRR.toFixed(2));
  const arrRounded = Number((mrrRounded * 12).toFixed(2));

  // 2. Cash Collected this month
  const monthStart = `${asOfDateStr.substring(0, 7)}-01`;
  const cashRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS cash_collected
    FROM payments
    WHERE payment_date >= ?
  `).get(monthStart);

  const cashCollectedThisMonth = Number((cashRow ? cashRow.cash_collected : 0).toFixed(2));

  // 3. Overdue Aging
  const aging = getOverdueAgingAnalysis(asOfDateStr);

  const latencyMs = Number((performance.now() - startTime).toFixed(2));

  return {
    executionLatencyMs: latencyMs,
    slaCompliant: latencyMs < 2000,
    mrr: mrrRounded,
    arr: arrRounded,
    activeSubscriptionsCount: activeSubs.length,
    cashCollectedThisMonth,
    totalOverdueDebt: aging.totalOverdueDebt,
    agingBuckets: aging.agingBuckets
  };
}

module.exports = {
  getOverdueAgingAnalysis,
  getExecutiveFinancialDashboard
};
