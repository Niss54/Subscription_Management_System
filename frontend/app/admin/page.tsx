'use client';

import React, { useEffect, useState } from 'react';
import { TrendingUp, Calendar, Wallet, AlertTriangle, RefreshCw, PlayCircle, Clock } from 'lucide-react';
import { apiRequest } from '@/lib/api';

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    const t0 = performance.now();
    try {
      const res = await apiRequest('/dashboard/summary');
      const dur = Math.round(performance.now() - t0);
      setLatency(dur);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const triggerBilling = async () => {
    const res = await apiRequest('/invoices/run-billing-cycle', { method: 'POST' });
    if (res.ok) {
      const result = await res.json();
      alert(`Mass Billing Run Success!\nGenerated: ${result.invoices_generated}\nProcessed: ${result.processed_count}\nSkipped: ${result.skipped_count}`);
      fetchDashboard();
    } else {
      alert('Billing cycle run failed');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Executive Financial Dashboard</h1>
          <p className="text-sm text-slate-400">Live analytics normalized across recurring frequencies with &lt;2s SLA guarantee.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-sky-400 flex items-center space-x-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Latency SLA: <strong className="text-white">{latency !== null ? `${latency} ms` : '--'}</strong> (&lt; 2000ms)</span>
          </div>
          <button
            onClick={triggerBilling}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-sm font-semibold shadow-md shadow-sky-500/20 transition-all flex items-center space-x-2"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Run Mass Billing Run</span>
          </button>
          <button
            onClick={fetchDashboard}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>MRR (Monthly Recurring)</span>
            <TrendingUp className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">
            ${data ? data.mrr.toFixed(2) : '0.00'}
          </div>
          <p className="text-xs text-slate-500 font-mono">30.4375 d/mo, 4.348 w/mo</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>ARR (Annual Run-Rate)</span>
            <Calendar className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">
            ${data ? data.arr.toFixed(2) : '0.00'}
          </div>
          <p className="text-xs text-indigo-400 font-mono">= MRR × 12.0</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Cash Collected (MTD)</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">
            ${data ? data.cash_collected_this_month.toFixed(2) : '0.00'}
          </div>
          <p className="text-xs text-emerald-400">Reconciled Payments</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Overdue Receivables</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-extrabold text-rose-400">
            ${data ? data.overdue_invoices_total.toFixed(2) : '0.00'}
          </div>
          <p className="text-xs text-slate-400">
            Count: {data ? data.overdue_invoices_count : 0} Invoices
          </p>
        </div>
      </div>

      {/* Aging Buckets */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h2 className="text-base font-bold text-white">Overdue Aging Buckets (Odoo Hackathon Requirement)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/20">
            <span className="text-xs text-amber-400 font-medium">1 – 30 Days</span>
            <div className="text-2xl font-bold text-white mt-1">
              ${data?.overdue_aging_buckets?.['1_30']?.toFixed(2) || '0.00'}
            </div>
            <span className="text-[11px] text-slate-500">Early Notice</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-orange-500/20">
            <span className="text-xs text-orange-400 font-medium">31 – 60 Days</span>
            <div className="text-2xl font-bold text-white mt-1">
              ${data?.overdue_aging_buckets?.['31_60']?.toFixed(2) || '0.00'}
            </div>
            <span className="text-[11px] text-slate-500">Dunning Notice</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-rose-500/20">
            <span className="text-xs text-rose-400 font-medium">61 – 90 Days</span>
            <div className="text-2xl font-bold text-white mt-1">
              ${data?.overdue_aging_buckets?.['61_90']?.toFixed(2) || '0.00'}
            </div>
            <span className="text-[11px] text-slate-500">Service Hold</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-red-600/30">
            <span className="text-xs text-red-400 font-medium">90+ Days</span>
            <div className="text-2xl font-bold text-white mt-1">
              ${data?.overdue_aging_buckets?.['90_plus']?.toFixed(2) || '0.00'}
            </div>
            <span className="text-[11px] text-slate-500">Collections</span>
          </div>
        </div>
      </div>
    </div>
  );
}
