import './globals.css';
import Navbar from '@/components/Navbar';
import React from 'react';

export const metadata = {
  title: 'Brightloop Software — Subscription Management System',
  description: 'FastAPI + Next.js 15 + Supabase Subscription Management System for Odoo Hackathon',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#060913] text-slate-100 min-h-screen">
        <Navbar />
        <main className="max-w-7xl mx-auto p-6">{children}</main>
      </body>
    </html>
  );
}
