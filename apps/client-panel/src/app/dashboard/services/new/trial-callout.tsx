'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Loader2, Check } from 'lucide-react';
import type { PlanDto } from '@verris/contracts';
import { getTrialEligibilityAction, startTrialAction } from './actions';

/**
 * O-1 — free trial entry point shown above the paid order form. Renders only
 * when at least one plan offers a trial AND the account is still eligible
 * (one trial per account). Lets the user pick a trial-eligible plan + domain
 * and provisions a free trial in one click.
 */
export function TrialCallout({ plans }: { plans: PlanDto[] }) {
  const router = useRouter();
  const trialPlans = plans.filter((p) => p.trialDays > 0);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [planId, setPlanId] = useState(trialPlans[0]?.id ?? '');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (trialPlans.length === 0) {
      setEligible(false);
      return;
    }
    void getTrialEligibilityAction().then((r) => setEligible(r.eligible));
  }, [trialPlans.length]);

  if (trialPlans.length === 0 || eligible === false) return null;

  const selected = trialPlans.find((p) => p.id === planId) ?? trialPlans[0];

  const onStart = () => {
    setError(null);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim())) {
      setError('Podaj poprawną domenę (np. mojafirma.pl).');
      return;
    }
    startTransition(async () => {
      const res = await startTrialAction({ planId: selected.id, domain: domain.trim().toLowerCase() });
      if (!res.ok) {
        setError(res.error ?? 'Nie udało się uruchomić okresu próbnego.');
        return;
      }
      router.push('/dashboard/services');
      router.refresh();
    });
  };

  return (
    <div className="rounded-[24px] border border-emerald-400/30 bg-emerald-400/[0.06] p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Gift className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Wypróbuj za darmo</h2>
          <p className="text-sm text-emerald-100/80">
            {selected.trialDays} dni pełnego hostingu bez opłat. Bez karty. Jeden okres próbny na
            konto.
          </p>
        </div>
      </div>

      {/* Wybór planu — klikalne kafle zamiast brzydkiego selecta */}
      <div className="mt-4 space-y-2">
        <span className="text-xs font-medium text-neutral-300">Wybierz plan próbny</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {trialPlans.map((p) => {
            const active = p.id === planId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanId(p.id)}
                aria-pressed={active}
                className={`flex flex-col items-start rounded-xl border px-3.5 py-3 text-left transition-colors ${
                  active
                    ? 'border-emerald-400/60 bg-emerald-400/10'
                    : 'border-white/10 bg-black/20 hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{p.name}</span>
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      active ? 'border-emerald-400 bg-emerald-400' : 'border-white/30'
                    }`}
                  >
                    {active ? <Check className="h-3 w-3 text-black" /> : null}
                  </span>
                </span>
                <span className="mt-1 text-[11px] text-emerald-200/90">{p.trialDays} dni za darmo</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-3 block space-y-1">
        <span className="text-xs font-medium text-neutral-300">Domena</span>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="mojafirma.pl"
          className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
        />
      </label>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <button
        type="button"
        onClick={onStart}
        disabled={isPending || eligible === null}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-black"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
        Uruchom darmowy okres próbny
      </button>
      <p className="mt-2 text-[11px] text-neutral-400">
        Po okresie próbnym usługa zostanie zawieszona, chyba że przekształcisz ją na płatną. Dane
        przechowujemy 30 dni.
      </p>
    </div>
  );
}
