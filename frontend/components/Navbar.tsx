'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Play, User, Sparkles } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Operations', href: '/staff' },
    { label: 'Customer Portal', href: '/portal' },
  ];

  return (
    <header className="sticky top-3 sm:top-5 z-50 px-3 sm:px-6 max-w-6xl mx-auto transition-all">
      <div className="bg-[#0c0d14]/95 backdrop-blur-2xl border border-white/10 rounded-full px-4 sm:px-6 py-2 shadow-2xl flex items-center justify-between gap-3">
        
        {/* Left: Logo & Brand */}
        <Link href="/" className="flex items-center space-x-3 group">
          <img
            src="/logo.png"
            alt="Brightloop Logo"
            className="w-8 h-8 rounded-lg object-contain transition-transform group-hover:scale-105"
          />
          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-xs sm:text-sm tracking-wider text-white uppercase leading-none">
                BRIGHTLOOP
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                AI
              </span>
            </div>
            <span className="text-[9px] font-mono tracking-widest text-slate-400 uppercase mt-0.5">
              BILLING COPILOT
            </span>
          </div>
        </Link>

        {/* Center: Capsule Navigation Pills */}
        <nav className="hidden md:flex items-center space-x-1 p-1 rounded-full bg-white/5 border border-white/10">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-white/15 text-white border border-white/20 shadow-inner'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Action Buttons (Exact Replica of Screenshot 2 Style) */}
        <div className="flex items-center space-x-2">
          {/* Glowing Primary Pill Button ('Run Billing' - like 'Start Talking' in screenshot 2) */}
          <Link
            href="/admin"
            className="px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/25 transition-all flex items-center space-x-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Billing</span>
          </Link>

          {/* Secondary Outlined Pill Button ('Account' - like 'Patient Status' in screenshot 2) */}
          <Link
            href="/portal"
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/15 text-white transition-all flex items-center space-x-1.5"
          >
            <User className="w-3.5 h-3.5" />
            <span>Account</span>
          </Link>
        </div>

      </div>
    </header>
  );
}
