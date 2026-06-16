'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { convertTrialAction } from './subscription-payment-actions';

/** O-1 — converts a trial to a paid wallet subscription (charges one month). */
export function ConvertTrialButton({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await convertTrialAction(serviceId);
      if (!res.ok) {
        setError(res.error ?? 'Nie udało się przekształcić usługi.');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 px-2.5 py-1 text-[11px] font-semibold text-black"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        Przekształć na płatną
      </button>
      {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}
