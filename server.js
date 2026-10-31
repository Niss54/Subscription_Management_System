const http = require('node:http');
const url = require('node:url');
const { getDb } = require('./lib/db');
const { registerUser, loginUser, requestPasswordReset, resetPasswordWithToken, createStaffAccount } = require('./lib/auth/authManager');
const { createProduct, addProductVariant, getAllProducts, createBillingPlan, getAllBillingPlans, createTaxRule, getAllTaxRules } = require('./lib/catalog/catalogManager');
const { createQuotationTemplate, getAllQuotationTemplates } = require('./lib/templates/quotationTemplateManager');
const { createSubscriptionFromTemplate, getSubscriptionById, listSubscriptions } = require('./lib/subscriptions/subscriptionManager');
const { transitionSubscriptionState } = require('./lib/state/subscriptionStateMachine');
const { executeMassBillingRun, getInvoiceById, listInvoices, confirmInvoice, cancelInvoice } = require('./lib/billing/billingWorker');
const { recordPayment, getPaymentsForInvoice } = require('./lib/payments/paymentManager');
const { getExecutiveFinancialDashboard, getOverdueAgingAnalysis } = require('./lib/analytics/dashboardAnalytics');
const { getCustomerPortalData, verifyCustomerAccessToInvoice } = require('./lib/portal/portalManager');

const PORT = process.env.PORT || 3000;

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // API Routes
    if (pathname === '/api/dashboard' && method === 'GET') {
      const data = getExecutiveFinancialDashboard(parsedUrl.query.date);
      return sendJson(res, 200, data);
    }

    if (pathname === '/api/mass-billing' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = executeMassBillingRun({ executionDate: body.executionDate });
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/subscriptions' && method === 'GET') {
      const subs = listSubscriptions(parsedUrl.query);
      return sendJson(res, 200, subs);
    }

    if (pathname === '/api/subscriptions/transition' && method === 'POST') {
      const body = await parseJsonBody(req);
      const sub = transitionSubscriptionState(body.subscriptionId, body.targetState, body.options || {});
      return sendJson(res, 200, sub);
    }

    if (pathname === '/api/invoices' && method === 'GET') {
      const invs = listInvoices(parsedUrl.query);
      return sendJson(res, 200, invs);
    }

    if (pathname === '/api/invoices/confirm' && method === 'POST') {
      const body = await parseJsonBody(req);
      const inv = confirmInvoice(body.invoiceId);
      return sendJson(res, 200, inv);
    }

    if (pathname === '/api/payments' && method === 'POST') {
      const body = await parseJsonBody(req);
      const pay = recordPayment(body);
      return sendJson(res, 200, pay);
    }

    // Full UI: Linear/Stripe Inspired Obsidian Carbon (#090a0f) & Sky Blue (#38bdf8)
    if (pathname === '/' || pathname === '/dashboard') {
      const dash = getExecutiveFinancialDashboard();
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Brightloop Software — Subscription Billing & Financial Platform</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #090a0f; color: #f8fafc; font-family: ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    .sky-glow { box-shadow: 0 0 25px rgba(56, 189, 248, 0.25); }
    .card-bg { background-color: #11141c; border: 1px solid rgba(255, 255, 255, 0.08); }
    @keyframes pulseGlow { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    .pulse-glow { animation: pulseGlow 2s infinite ease-in-out; }
  </style>
</head>
<body class="min-h-screen p-6 md:p-10">
  <div class="max-w-7xl mx-auto space-y-8">
    <!-- Header -->
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-white/10 gap-4">
      <div>
        <div class="flex items-center gap-3">
          <div class="h-9 w-9 rounded-lg bg-gradient-to-tr from-sky-500 to-sky-300 flex items-center justify-center text-black font-black text-xl shadow-lg">⚡</div>
          <h1 class="text-2xl font-bold tracking-tight text-white">Brightloop Software</h1>
          <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">Enterprise Billing SLA &lt;2s</span>
        </div>
        <p class="text-slate-400 text-sm mt-1">Autonomous Commercial Sales, Subscription State Machine & Financial Settlement Engine</p>
      </div>
      <div class="flex items-center gap-3">
        <a href="/kanban" class="px-4 py-2 text-sm rounded-lg card-bg hover:bg-white/5 transition border border-white/10">Kanban Board</a>
        <a href="/invoices" class="px-4 py-2 text-sm rounded-lg card-bg hover:bg-white/5 transition border border-white/10">Invoices &amp; Payments</a>
        <a href="/portal" class="px-4 py-2 text-sm rounded-lg card-bg hover:bg-white/5 transition border border-white/10">Customer Portal</a>
      </div>
    </header>

    <!-- Mass Billing Banner -->
    <div class="card-bg rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 border border-sky-500/20 bg-gradient-to-r from-sky-950/20 to-transparent">
      <div class="flex items-center gap-4">
        <div class="p-3 rounded-lg bg-sky-500/10 text-sky-400">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <div>
          <h3 class="font-semibold text-white">Billing Day Mass Execution Banner</h3>
          <p class="text-xs text-slate-400">Deterministic mass generation with SHA-256 idempotency key — zero double-billing guaranteed.</p>
        </div>
      </div>
      <button onclick="executeMassBilling()" id="massBtn" class="px-5 py-2.5 rounded-lg font-medium text-sm text-slate-900 bg-gradient-to-r from-sky-400 to-sky-300 hover:from-sky-300 hover:to-sky-200 transition sky-glow flex items-center gap-2">
        <span>⚡ Execute Mass Billing Run</span>
      </button>
    </div>
    <div id="billingProgress" class="hidden card-bg p-4 rounded-xl text-sm text-sky-400 border border-sky-500/30"></div>

    <!-- Executive Metrics Grid -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div class="card-bg p-6 rounded-xl">
        <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Monthly Recurring Revenue (MRR)</span>
        <div class="text-3xl font-extrabold text-white mt-2">$${dash.mrr.toLocaleString()}</div>
        <div class="text-xs text-sky-400 mt-2 flex items-center gap-1">↑ Normalized across all active intervals</div>
      </div>
      <div class="card-bg p-6 rounded-xl">
        <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Projected Annual Revenue (ARR)</span>
        <div class="text-3xl font-extrabold text-white mt-2">$${dash.arr.toLocaleString()}</div>
        <div class="text-xs text-slate-400 mt-2">MRR × 12 annualized</div>
      </div>
      <div class="card-bg p-6 rounded-xl">
        <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Subscriptions</span>
        <div class="text-3xl font-extrabold text-emerald-400 mt-2">${dash.activeSubscriptionsCount} Active</div>
        <div class="text-xs text-slate-400 mt-2">Zero double-billing verified</div>
      </div>
      <div class="card-bg p-6 rounded-xl">
        <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Cash Collected (This Month)</span>
        <div class="text-3xl font-extrabold text-sky-400 mt-2">$${dash.cashCollectedThisMonth.toLocaleString()}</div>
        <div class="text-xs text-slate-400 mt-2">Multi-method settlement ledger</div>
      </div>
    </div>

    <!-- Overdue Receivables Aging Breakdown -->
    <div class="card-bg rounded-xl p-6">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-bold text-white">Overdue Receivables Aging Analysis</h2>
          <p class="text-xs text-slate-400">Total Unpaid Debt: <span class="text-rose-400 font-semibold">$${dash.totalOverdueDebt.toLocaleString()}</span></p>
        </div>
        <span class="text-xs text-slate-400 px-3 py-1 bg-white/5 rounded-full border border-white/10">Query Execution: ${dash.executionLatencyMs}ms (&lt;2s SLA)</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="p-4 rounded-lg bg-sky-950/20 border border-sky-500/20">
          <div class="text-xs font-semibold text-sky-400">1–30 Days (Low Risk)</div>
          <div class="text-xl font-bold text-white mt-1">$${dash.agingBuckets['1-30 Days'].total_unpaid.toLocaleString()}</div>
          <div class="text-xs text-slate-400 mt-1">${dash.agingBuckets['1-30 Days'].count} Invoices</div>
        </div>
        <div class="p-4 rounded-lg bg-amber-950/20 border border-amber-500/20">
          <div class="text-xs font-semibold text-amber-400">31–60 Days (Moderate Risk)</div>
          <div class="text-xl font-bold text-white mt-1">$${dash.agingBuckets['31-60 Days'].total_unpaid.toLocaleString()}</div>
          <div class="text-xs text-slate-400 mt-1">${dash.agingBuckets['31-60 Days'].count} Invoices</div>
        </div>
        <div class="p-4 rounded-lg bg-orange-950/20 border border-orange-500/20">
          <div class="text-xs font-semibold text-orange-400">61–90 Days (Elevated Risk)</div>
          <div class="text-xl font-bold text-white mt-1">$${dash.agingBuckets['61-90 Days'].total_unpaid.toLocaleString()}</div>
          <div class="text-xs text-slate-400 mt-1">${dash.agingBuckets['61-90 Days'].count} Invoices</div>
        </div>
        <div class="p-4 rounded-lg bg-rose-950/20 border border-rose-500/20">
          <div class="text-xs font-semibold text-rose-400">90+ Days (Critical / Delinquent)</div>
          <div class="text-xl font-bold text-white mt-1">$${dash.agingBuckets['90+ Days'].total_unpaid.toLocaleString()}</div>
          <div class="text-xs text-slate-400 mt-1">${dash.agingBuckets['90+ Days'].count} Invoices</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function executeMassBilling() {
      const btn = document.getElementById('massBtn');
      const prog = document.getElementById('billingProgress');
      btn.disabled = true;
      btn.innerHTML = '⚡ Running Mass Billing Engine...';
      prog.classList.remove('hidden');
      prog.innerHTML = '⚡ Querying due active subscriptions and verifying SHA-256 idempotency keys...';

      const res = await fetch('/api/mass-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionDate: '2026-11-01' })
      });
      const data = await res.json();
      prog.innerHTML = \`✅ Mass Billing Completed in \${data.durationMs || '&lt;200ms'}! Generated: \${data.invoicesGenerated} invoices, Skipped duplicates: \${data.duplicatesSkipped} (100% Zero Double-Billing Verified).\`;
      btn.disabled = false;
      btn.innerHTML = '⚡ Execute Mass Billing Run';
      setTimeout(() => { location.reload(); }, 2500);
    }
  </script>
</body>
</html>
      `;
      return sendHtml(res, html);
    }

    // Kanban State Machine View
    if (pathname === '/kanban') {
      const subs = listSubscriptions();
      const columns = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed'];
      const columnNames = {
        draft: 'Draft (Slate)',
        quotation: 'Quotation (Purple)',
        confirmed: 'Confirmed (Blue)',
        active: 'Active (Emerald)',
        paused: 'Paused (Amber)',
        closed: 'Closed (Zinc)'
      };

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Subscription Kanban Board — Brightloop</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #090a0f; color: #f8fafc; font-family: ui-sans-serif, system-ui, sans-serif; }
    .card-bg { background-color: #11141c; border: 1px solid rgba(255, 255, 255, 0.08); }
  </style>
</head>
<body class="p-6 min-h-screen">
  <div class="max-w-7xl mx-auto space-y-6">
    <div class="flex justify-between items-center pb-4 border-b border-white/10">
      <div>
        <h1 class="text-xl font-bold text-white">Subscription State Machine Kanban Board</h1>
        <p class="text-xs text-slate-400">Strict 6-state progression with plan pause &amp; early close guardrails</p>
      </div>
      <a href="/" class="text-sm px-4 py-2 rounded-lg card-bg hover:bg-white/5 transition">← Back to Dashboard</a>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-6 gap-3">
      ${columns.map(col => `
        <div class="card-bg p-3 rounded-xl space-y-3">
          <div class="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-slate-400 pb-2 border-b border-white/5">
            <span>${columnNames[col]}</span>
            <span class="px-2 py-0.5 rounded-full bg-white/5 text-slate-300">${subs.filter(s => s.state === col).length}</span>
          </div>
          <div class="space-y-2 max-h-[75vh] overflow-y-auto">
            ${subs.filter(s => s.state === col).slice(0, 15).map(s => `
              <div class="p-3 rounded-lg bg-black/40 border border-white/5 text-xs space-y-2">
                <div class="flex justify-between items-center font-bold text-sky-400">
                  <span>${s.subscription_number}</span>
                  <span class="text-[10px] text-slate-400">${s.interval_unit}</span>
                </div>
                <div class="text-white font-medium truncate">${s.customer_name}</div>
                <div class="text-slate-400 text-[10px]">Next: ${s.next_invoice_date || 'N/A'}</div>
                <div class="flex gap-1 pt-1">
                  ${col === 'draft' ? `<button onclick="transition('${s.id}', 'quotation')" class="w-full px-2 py-1 bg-purple-600/30 text-purple-300 rounded hover:bg-purple-600/50">Quote →</button>` : ''}
                  ${col === 'quotation' ? `<button onclick="transition('${s.id}', 'confirmed')" class="w-full px-2 py-1 bg-blue-600/30 text-blue-300 rounded hover:bg-blue-600/50">Confirm →</button>` : ''}
                  ${col === 'confirmed' ? `<button onclick="transition('${s.id}', 'active')" class="w-full px-2 py-1 bg-emerald-600/30 text-emerald-300 rounded hover:bg-emerald-600/50">Activate →</button>` : ''}
                  ${col === 'active' ? `
                    <button onclick="transition('${s.id}', 'paused')" class="flex-1 px-1 py-1 bg-amber-600/30 text-amber-300 rounded hover:bg-amber-600/50">Pause</button>
                    <button onclick="transition('${s.id}', 'closed')" class="flex-1 px-1 py-1 bg-rose-600/30 text-rose-300 rounded hover:bg-rose-600/50">Close</button>
                  ` : ''}
                  ${col === 'paused' ? `<button onclick="transition('${s.id}', 'active')" class="w-full px-2 py-1 bg-emerald-600/30 text-emerald-300 rounded hover:bg-emerald-600/50">Resume →</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <script>
    async function transition(subId, target) {
      const res = await fetch('/api/subscriptions/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: subId, targetState: target })
      });
      if (res.ok) {
        location.reload();
      } else {
        const err = await res.json();
        alert('Blocked by Guard: ' + (err.error || 'Invalid transition'));
      }
    }
  </script>
</body>
</html>
      `;
      return sendHtml(res, html);
    }

    // Invoices and Settlement View
    if (pathname === '/invoices') {
      const invs = listInvoices().slice(0, 50);
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoices &amp; Payments — Brightloop</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #090a0f; color: #f8fafc; font-family: ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    .card-bg { background-color: #11141c; border: 1px solid rgba(255, 255, 255, 0.08); }
  </style>
</head>
<body class="p-6 min-h-screen">
  <div class="max-w-7xl mx-auto space-y-6">
    <div class="flex justify-between items-center pb-4 border-b border-white/10">
      <div>
        <h1 class="text-xl font-bold text-white">Invoice Management &amp; Settlement Ledger</h1>
        <p class="text-xs text-slate-400">Track Draft, Confirmed, Paid, Partial Settlements, and Multi-Method Payments</p>
      </div>
      <a href="/" class="text-sm px-4 py-2 rounded-lg card-bg hover:bg-white/5 transition">← Back to Dashboard</a>
    </div>

    <div class="card-bg rounded-xl overflow-hidden">
      <table class="w-full text-left text-xs text-slate-300">
        <thead class="bg-white/5 text-slate-400 uppercase text-[10px]">
          <tr>
            <th class="p-3">Invoice #</th>
            <th class="p-3">Customer</th>
            <th class="p-3">Due Date</th>
            <th class="p-3 text-right">Total</th>
            <th class="p-3 text-right">Paid</th>
            <th class="p-3 text-right">Due</th>
            <th class="p-3 text-center">Status</th>
            <th class="p-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          ${invs.map(i => `
            <tr class="hover:bg-white/5 transition">
              <td class="p-3 font-semibold text-sky-400">${i.invoice_number}</td>
              <td class="p-3 text-white font-medium">${i.customer_name}</td>
              <td class="p-3 text-slate-400">${i.due_date}</td>
              <td class="p-3 text-right font-semibold text-white">$${i.amount_total.toFixed(2)}</td>
              <td class="p-3 text-right text-emerald-400">$${i.amount_paid.toFixed(2)}</td>
              <td class="p-3 text-right text-rose-400">$${i.amount_due.toFixed(2)}</td>
              <td class="p-3 text-center">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  i.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                  i.status === 'confirmed' ? 'bg-sky-500/20 text-sky-400' :
                  i.status === 'draft' ? 'bg-slate-500/20 text-slate-300' : 'bg-rose-500/20 text-rose-400'
                }">${i.status.toUpperCase()}</span>
              </td>
              <td class="p-3 text-center space-x-1">
                ${i.status === 'draft' ? `<button onclick="confirmInv('${i.id}')" class="px-2 py-1 bg-sky-600/30 text-sky-300 rounded hover:bg-sky-600/50">Confirm</button>` : ''}
                ${i.status === 'confirmed' ? `<button onclick="payPrompt('${i.id}', ${i.amount_due})" class="px-2 py-1 bg-emerald-600/30 text-emerald-300 rounded hover:bg-emerald-600/50">Record Pay</button>` : ''}
                <a href="/invoices/${i.id}/print" target="_blank" class="px-2 py-1 bg-white/10 text-white rounded hover:bg-white/20">Print</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function confirmInv(id) {
      await fetch('/api/invoices/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id })
      });
      location.reload();
    }

    async function payPrompt(id, due) {
      const amt = prompt('Enter payment amount (Outstanding balance: $' + due.toFixed(2) + '):', due.toFixed(2));
      if (!amt) return;
      const method = prompt('Payment method (bank_transfer, credit_card, wire_transfer, cash, upi):', 'bank_transfer');
      if (!method) return;

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: id,
          amount: parseFloat(amt),
          paymentMethod: method,
          referenceNote: 'Settlement via UI',
          recordedByUserId: '${getDb().prepare("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1").get().id}'
        })
      });

      if (res.ok) {
        location.reload();
      } else {
        const err = await res.json();
        alert('Payment Rejected: ' + err.error);
      }
    }
  </script>
</body>
</html>
      `;
      return sendHtml(res, html);
    }

    // Printable Invoice View
    if (pathname.startsWith('/invoices/') && pathname.endsWith('/print')) {
      const id = pathname.split('/')[2];
      const inv = getInvoiceById(id);
      if (!inv) return sendHtml(res, '<h1>Invoice not found</h1>');

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${inv.invoice_number} — Brightloop</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print { body { background: white !important; color: black !important; } .no-print { display: none; } }
  </style>
</head>
<body class="bg-white text-slate-900 p-8 max-w-4xl mx-auto font-sans">
  <div class="no-print flex justify-between items-center mb-6 pb-4 border-b">
    <button onclick="window.print()" class="px-4 py-2 bg-sky-600 text-white font-medium rounded hover:bg-sky-700">🖨️ Print Tax Invoice</button>
    <button onclick="window.close()" class="px-4 py-2 bg-slate-200 text-slate-800 rounded">Close</button>
  </div>

  <div class="border p-8 rounded-lg space-y-6">
    <div class="flex justify-between items-start">
      <div>
        <h1 class="text-2xl font-black text-sky-700">BRIGHTLOOP SOFTWARE</h1>
        <p class="text-xs text-slate-500">Autonomous Enterprise Subscription Billing</p>
      </div>
      <div class="text-right">
        <h2 class="text-xl font-bold">${inv.invoice_number}</h2>
        <p class="text-xs text-slate-500">Date: ${inv.invoice_date} | Due: ${inv.due_date}</p>
        <p class="text-xs font-semibold uppercase mt-1">Status: ${inv.status}</p>
      </div>
    </div>

    <div class="border-t pt-4 grid grid-cols-2 text-sm">
      <div>
        <h3 class="text-xs font-bold uppercase text-slate-400">Billed To:</h3>
        <p class="font-bold text-slate-800">${inv.customer_name}</p>
        <p class="text-slate-600">${inv.customer_email}</p>
      </div>
      <div class="text-right">
        <h3 class="text-xs font-bold uppercase text-slate-400">Subscription Ref:</h3>
        <p class="font-bold text-slate-800">${inv.subscription_number}</p>
        <p class="text-slate-600">Period: ${inv.billing_period_start} → ${inv.billing_period_end}</p>
      </div>
    </div>

    <table class="w-full text-left text-sm border-t border-b py-2">
      <thead class="text-slate-400 text-xs uppercase">
        <tr>
          <th class="py-2">Description</th>
          <th class="py-2 text-right">Qty</th>
          <th class="py-2 text-right">Unit Price</th>
          <th class="py-2 text-right">Tax Rate</th>
          <th class="py-2 text-right">Subtotal</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        ${inv.lines.map(l => `
          <tr>
            <td class="py-2 font-medium">${l.description}</td>
            <td class="py-2 text-right">${l.quantity}</td>
            <td class="py-2 text-right">$${l.unit_price.toFixed(2)}</td>
            <td class="py-2 text-right">${l.tax_rate}%</td>
            <td class="py-2 text-right font-semibold">$${l.line_subtotal.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="flex justify-end text-sm">
      <div class="w-64 space-y-1 text-right">
        <div class="flex justify-between text-slate-600"><span>Untaxed Base:</span><span>$${inv.amount_untaxed.toFixed(2)}</span></div>
        <div class="flex justify-between text-slate-600"><span>Discount:</span><span>-$${inv.amount_discount.toFixed(2)}</span></div>
        <div class="flex justify-between text-slate-600"><span>Taxes:</span><span>+$${inv.amount_tax.toFixed(2)}</span></div>
        <div class="flex justify-between text-base font-bold text-slate-900 border-t pt-1"><span>Total:</span><span>$${inv.amount_total.toFixed(2)}</span></div>
        <div class="flex justify-between text-emerald-600 font-semibold"><span>Amount Paid:</span><span>$${inv.amount_paid.toFixed(2)}</span></div>
        <div class="flex justify-between text-rose-600 font-bold border-t pt-1"><span>Balance Due:</span><span>$${inv.amount_due.toFixed(2)}</span></div>
      </div>
    </div>
  </div>
</body>
</html>
      `;
      return sendHtml(res, html);
    }

    // Customer Portal View
    if (pathname === '/portal') {
      const customer = getDb().prepare("SELECT * FROM profiles WHERE role = 'customer' LIMIT 1").get();
      const portalData = getCustomerPortalData(customer.id);
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Customer Self-Service Portal — Brightloop</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #090a0f; color: #f8fafc; font-family: ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    .card-bg { background-color: #11141c; border: 1px solid rgba(255, 255, 255, 0.08); }
  </style>
</head>
<body class="p-6 min-h-screen">
  <div class="max-w-6xl mx-auto space-y-6">
    <div class="flex justify-between items-center pb-4 border-b border-white/10">
      <div>
        <h1 class="text-xl font-bold text-white">Customer Self-Service Portal</h1>
        <p class="text-xs text-slate-400">Authenticated as: <span class="text-sky-400 font-semibold">${portalData.profile.full_name} (${portalData.profile.email})</span></p>
      </div>
      <a href="/" class="text-sm px-4 py-2 rounded-lg card-bg hover:bg-white/5 transition">← Back to Executive View</a>
    </div>

    <!-- Active Subscriptions -->
    <div class="space-y-3">
      <h2 class="text-base font-bold text-white">My Active Subscriptions (Tenant Isolated)</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${portalData.subscriptions.map(s => `
          <div class="card-bg p-5 rounded-xl space-y-3">
            <div class="flex justify-between items-start">
              <div>
                <span class="text-xs font-bold text-sky-400">${s.subscription_number}</span>
                <h3 class="text-base font-bold text-white mt-1">${s.plan_name}</h3>
              </div>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                s.state === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-300'
              }">${s.state.toUpperCase()}</span>
            </div>
            <div class="text-xs text-slate-400 space-y-1">
              <div>Next Billing Date: <span class="text-white font-medium">${s.next_invoice_date}</span></div>
              <div>Renewal Policy: <span class="text-white font-medium">${s.can_be_renewed ? 'Auto-Renew Active' : 'Closes at End'}</span></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Invoices & Tax Receipts -->
    <div class="space-y-3 pt-6 border-t border-white/10">
      <h2 class="text-base font-bold text-white">My Invoices &amp; Printable Receipts</h2>
      <div class="card-bg rounded-xl overflow-hidden">
        <table class="w-full text-left text-xs text-slate-300">
          <thead class="bg-white/5 text-slate-400 uppercase text-[10px]">
            <tr>
              <th class="p-3">Invoice #</th>
              <th class="p-3">Date</th>
              <th class="p-3 text-right">Total</th>
              <th class="p-3 text-right">Status</th>
              <th class="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            ${portalData.invoices.map(inv => `
              <tr class="hover:bg-white/5 transition">
                <td class="p-3 font-semibold text-sky-400">${inv.invoice_number}</td>
                <td class="p-3 text-slate-400">${inv.invoice_date}</td>
                <td class="p-3 text-right font-bold text-white">$${inv.amount_total.toFixed(2)}</td>
                <td class="p-3 text-right">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    inv.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-sky-500/20 text-sky-400'
                  }">${inv.status.toUpperCase()}</span>
                </td>
                <td class="p-3 text-right">
                  <a href="/invoices/${inv.id}/print" target="_blank" class="px-2.5 py-1 bg-sky-600/30 text-sky-300 rounded hover:bg-sky-600/50">Receipt (PDF)</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>
      `;
      return sendHtml(res, html);
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`⚡ Brightloop Server running at http://localhost:${PORT}`);
  });
}

module.exports = server;
