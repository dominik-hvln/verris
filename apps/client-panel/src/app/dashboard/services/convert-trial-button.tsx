'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { convertTrialAction } from './subscription-payment-actions';
import { trackPurchase } from '@/lib/analytics-events';

/**
 * O-1 — converts a trial to a paid wallet subscription (charges one month).
 * Konwersja = zawarcie odpłatnej umowy, więc wymaga oświadczenia
 * konsumenckiego (art. 15 ust. 3 / 21 ust. 2 upk) przed kliknięciem.
 */
export function ConvertTrialButton({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await convertTrialAction(serviceId, consent);
      if (!res.ok) {
        setError(res.error ?? 'Nie udało się przekształcić usługi.');
        return;
      }
      // GA4: purchase bez `value` (cena planu nieznana w tym komponencie) —
      // GA4 przyjmie zdarzenie, a wartość doda docelowy pomiar server-side.
      trackPurchase({
        transactionId: `trial-convert-${serviceId}`,
        value: 0,
        items: [{ item_name: 'Konwersja triala', item_category: 'hosting', quantity: 1 }],
      });
      router.refresh();
    });
  };

  return (
    <div className="mt-1.5 space-y-1.5">
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-white/5 accent-emerald-400"
        />
        <span className="text-[10px] leading-relaxed text-neutral-400">
          Żądam rozpoczęcia świadczenia płatnej usługi przed upływem 14-dniowego terminu
          odstąpienia; w razie odstąpienia zapłacę za świadczenia spełnione do tej chwili (
          <a href="/legal/terms" target="_blank" className="underline hover:text-neutral-200">
            Regulamin §21
          </a>
          ).
        </span>
      </label>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending || !consent}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 px-2.5 py-1 text-[11px] font-semibold text-black"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        Przekształć na płatną
      </button>
      {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}
