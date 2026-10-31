'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers, BarChart3, Briefcase, UserCheck, ShieldCheck } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Executive Dashboard', href: '/admin', icon: BarChart3 },
    { label: 'Operations (Staff)', href: '/staff', icon: Briefcase },
    { label: 'Customer Portal', href: '/portal', icon: UserCheck },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#0b0f19]/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
      <Link href="/" className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-300 flex items-center justify-center shadow-lg shadow-sky-500/20">
          <Layers className="w-5 h-5 text-slate-950 font-bold" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-sky-300 bg-clip-text text-transparent">
              Brightloop Software
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
              Next.js 15
            </span>
          </div>
          <p className="text-xs text-slate-400">Recurring Billing & Commercial Engine</p>
        </div>
      </Link>

      <nav className="hidden md:flex items-center space-x-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                isActive
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>FastAPI + Supabase</span>
        </div>
      </div>
    </header>
  );
}
