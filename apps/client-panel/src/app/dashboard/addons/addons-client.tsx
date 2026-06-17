'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2, Plus, Sparkles } from 'lucide-react';
import { formatCredits } from '@/lib/credits';
import { purchaseAddonAction, type AddonsOverview } from './addons-actions';

const STATUS_LABEL: Record<string, string> = {
  APPLIED: 'Aktywny',
  QUEUED: 'W realizacji',
  DONE: 'Zrealizowany',
};

export function AddonsClient({ overview }: { overview: AddonsOverview }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const buy = (slug: string) => {
    setBusy(slug);
    startTransition(async () => {
      const res = await purchaseAddonAction(slug);
      setBusy(null);
      if (!res.ok) {
        toast.error('Nie udało się kupić dodatku', { description: res.error });
        return;
      }
      toast.success('Dodatek kupiony', { description: res.note });
      // Odśwież licznik salda w topbarze (layout nasłuchuje tego zdarzenia).
      window.dispatchEvent(new Event('wallet:refresh'));
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {overview.prioritySupport.active ? (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-2.5 text-sm text-emerald-200 inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Masz aktywne priorytetowe wsparcie
          {overview.prioritySupport.until ? ` do ${new Date(overview.prioritySupport.until).toLocaleDateString('pl-PL')}` : ''}.
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {overview.catalog.map((a) => (
          <div key={a.slug} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col">
            <h3 className="text-lg font-bold text-white">{a.name}</h3>
            <p className="mt-1 flex-1 text-sm text-neutral-400">{a.description}</p>
            <p className="mt-4 text-2xl font-bold text-white">{formatCredits(a.price)}</p>
            <button
              type="button"
              onClick={() => buy(a.slug)}
              disabled={pending}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {busy === a.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Kup z portfela
            </button>
          </div>
        ))}
      </div>

      {overview.purchased.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">Historia dodatków</p>
          {overview.purchased.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
              <span className="text-white">{p.name}</span>
              <span className="flex items-center gap-3">
                <span className="text-neutral-400">{formatCredits(p.amount)}</span>
                <span className={`text-xs ${p.status === 'QUEUED' ? 'text-amber-300' : 'text-emerald-300'} inline-flex items-center gap-1`}>
                  {p.status !== 'QUEUED' ? <Check className="h-3 w-3" /> : null}
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
