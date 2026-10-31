'use client';

import React, { useEffect, useState } from 'react';
import { UserCheck, ShieldCheck, CreditCard, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '@/lib/api';

export default function CustomerPortalPage() {
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    async function fetchInvoices() {
      try {
        const res = await apiRequest('/invoices');
        if (res.ok) setInvoices(await res.json());
      } catch (err) {
        console.error(err);
      }
    }
    fetchInvoices();
  }, []);

  const handlePay = async (invoiceId: string, amount: string) => {
    const res = await apiRequest('/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({
        invoice_id: invoiceId,
        payment_method: 'upi',
        amount: amount,
        reference_note: 'Customer Portal Instant Pay',
      }),
    });
    if (res.ok) {
      alert(`Payment of $${amount} Successful! Invoice settled.`);
      const updated = await apiRequest('/invoices');
      if (updated.ok) setInvoices(await updated.json());
    } else {
      const err = await res.json();
      alert(`Payment error: ${err.detail}`);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Customer Self-Service Portal</h1>
        <p className="text-sm text-slate-400">View active membership, billing invoices, and 1-click online payment checkout.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Plan Card */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 border-l-4 border-l-sky-500">
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400">Current Plan</span>
            <ShieldCheck className="w-5 h-5 text-sky-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Enterprise Odoo ERP Cloud</h3>
          <p className="text-xs text-slate-400">Dedicated instance with Odoo Brand surcharge.</p>
          <div className="p-3 rounded-xl bg-slate-950 text-xs space-y-1 font-mono">
            <div className="flex justify-between text-slate-400"><span>Status:</span><span className="text-emerald-400 font-bold">ACTIVE</span></div>
            <div className="flex justify-between text-slate-400"><span>Billing:</span><span className="text-white">Monthly</span></div>
          </div>
        </div>

        {/* Invoices List */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-white">Invoices &amp; Online Checkout</h3>
            <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10">Instant Settlement</span>
          </div>

          <div className="space-y-3">
            {invoices.map((inv) => (
              <div key={inv.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm font-bold text-white">{inv.invoice_number}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${inv.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {inv.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Due Date: {inv.due_date} | Total: ${parseFloat(inv.amount_total).toFixed(2)}</p>
                </div>
                {inv.status === 'confirmed' ? (
                  <button
                    onClick={() => handlePay(inv.id, (inv.amount_total - (inv.amount_paid || 0)).toFixed(4))}
                    className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-md shadow-sky-500/25 flex items-center justify-center space-x-1.5"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Pay ${(inv.amount_total - (inv.amount_paid || 0)).toFixed(2)} Now</span>
                  </button>
                ) : (
                  <span className="text-xs text-slate-500 flex items-center space-x-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Settled</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
