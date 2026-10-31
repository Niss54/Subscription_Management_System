'use client';

import React, { useEffect, useState } from 'react';
import { Briefcase, Plus, Package, Repeat, FileText } from 'lucide-react';
import { apiRequest } from '@/lib/api';

export default function StaffOperationsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [prodRes, planRes, subRes] = await Promise.all([
          apiRequest('/products'),
          apiRequest('/plans'),
          apiRequest('/subscriptions'),
        ]);
        if (prodRes.ok) setProducts(await prodRes.json());
        if (planRes.ok) setPlans(await planRes.json());
        if (subRes.ok) setSubs(await subRes.json());
      } catch (err) {
        console.error(err);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Commercial Operations (Staff)</h1>
        <p className="text-sm text-slate-400">Configure Product Catalogs, Brand Variant Surcharges, Recurrence Plans, and Subscriptions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Products Card */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center space-x-2">
              <Package className="w-5 h-5 text-sky-400" />
              <span>Products & Brand Surcharges</span>
            </h3>
            <span className="text-xs px-2 py-1 rounded bg-sky-500/10 text-sky-400 font-mono">{products.length} Products</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {products.map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <div className="flex justify-between font-bold text-white">
                  <span>{p.name}</span>
                  <span>Base: ${parseFloat(p.base_sales_price).toFixed(2)}</span>
                </div>
                {p.variants?.map((v: any) => (
                  <div key={v.id} className="text-slate-400 mt-1 flex justify-between">
                    <span>• {v.variant_name} ({v.sku})</span>
                    <span className="text-sky-400 font-mono">+${parseFloat(v.price_extra).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Plans Card */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center space-x-2">
              <Repeat className="w-5 h-5 text-indigo-400" />
              <span>Billing Recurrence Plans</span>
            </h3>
            <span className="text-xs px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 font-mono">{plans.length} Plans</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {plans.map((pl) => (
              <div key={pl.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex justify-between items-center">
                <div>
                  <span className="font-bold text-white">{pl.name}</span>
                  <div className="text-slate-500 text-[11px]">
                    Frequency: {pl.interval_count} {pl.interval_unit} | Pause: {pl.allow_pause ? 'Yes' : 'No'}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                  Min: {pl.min_quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
