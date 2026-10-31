import Link from 'next/link';
import { BarChart3, Briefcase, UserCheck, Shield, CheckCircle2, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-12 py-8">
      {/* Hero */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-mono">
          <span>Odoo Hackathon Champion System</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
          Brightloop Subscription & Commercial Billing Engine
        </h1>
        <p className="text-base text-slate-400">
          FastAPI + Next.js 15 + Supabase. Engineered with strict invariant validation, zero double-billing idempotency, and sub-50ms financial analytics.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Link
            href="/admin"
            className="px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm transition-all shadow-lg shadow-sky-500/25 flex items-center space-x-2"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Open Executive Dashboard</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
          <Link
            href="/portal"
            className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-all flex items-center space-x-2"
          >
            <UserCheck className="w-4 h-4" />
            <span>Customer Portal</span>
          </Link>
        </div>
      </div>

      {/* 3 Pillar Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
        <Link href="/admin" className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/40 transition-all space-y-3 group">
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Admin Dashboard</h3>
          <p className="text-sm text-slate-400">
            Real-time normalized MRR, ARR, Cash collections, and 1-30, 31-60, 61-90, 90+ days overdue aging buckets.
          </p>
        </Link>

        <Link href="/staff" className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all space-y-3 group">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Briefcase className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Commercial Operations</h3>
          <p className="text-sm text-slate-400">
            Manage Brand Variants (Odoo Brand +$560 markup), Quotation Templates, Subscriptions state machine, and Discounts.
          </p>
        </Link>

        <Link href="/portal" className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-3 group">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
            <UserCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Customer Self-Service</h3>
          <p className="text-sm text-slate-400">
            Client self-checkout, live subscription state overview, and instant UPI/Card partial or full invoice settlement.
          </p>
        </Link>
      </div>
    </div>
  );
}
