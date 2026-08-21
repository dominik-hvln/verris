'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SavedPaymentMethodDto, WalletAutoTopupSettingsDto } from '@verris/contracts';
import {
  Cpu,
  Gift,
  Landmark,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { CREDIT_SHORT, formatCredits, pluralCredits } from '@/lib/credits';
import { redeemPromoAction, upsertAutoTopupAction } from './actions';
import { Select } from '@/components/panel';

interface Props {
  initialAuto: WalletAutoTopupSettingsDto;
  savedCards: SavedPaymentMethodDto[];
}

export function BillingExtrasForms({ initialAuto, savedCards }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <PromoRedeemBlock />
      <WalletAutotopupBlock initialAuto={initialAuto} savedCards={savedCards} />
    </div>
  );
}

function PromoRedeemBlock() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setDone(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await redeemPromoAction(fd);
      if (res.ok) {
        setCode('');
        setDone(
          `Na portfel dopisaliśmy ${formatCredits(res.amountPln, { signed: true })} — kod „${res.code}” został zrealizowany.`,
        );
        router.refresh();
      } else {
        setError(res.error ?? 'Błąd.');
      }
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-purple-400/25 bg-purple-400/10 text-purple-200">
          <Gift className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
            Kod promocyjny <Sparkles className="h-4 w-4 text-amber-200/90" aria-hidden />
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Wpisz kod od supportu lub z kampanii — kredyty trafią od razu na Twój portfel.
          </p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            name="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Np. DEMO10"
            autoComplete="off"
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 uppercase tracking-wide font-mono text-sm text-white placeholder:text-neutral-600 focus:border-white/35 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Zrealizuj
          </button>
        </div>
        {done ? (
          <p className="text-sm rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-4 py-2 text-emerald-100">
            {done}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm rounded-xl border border-rose-400/25 bg-rose-400/5 px-4 py-2 text-rose-100">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function WalletAutotopupBlock({
  initialAuto,
  savedCards,
}: {
  initialAuto: WalletAutoTopupSettingsDto;
  savedCards: SavedPaymentMethodDto[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState(initialAuto);
  const [cardId, setCardId] = useState(initialAuto.paymentMethodId ?? '');

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await upsertAutoTopupAction(fd);
      if (res.ok) {
        setLocal(res.settings);
        router.refresh();
      } else {
        setError(res.error ?? 'Błąd.');
      }
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-400/25 bg-sky-400/10 text-sky-100">
          <Cpu className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            Auto-doładowanie portfela
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Gdy saldo spadnie poniżej progu, system pobierze zapisany sposób płatności (Stripe, off-session).
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={local.enabled}
            className="h-4 w-4 rounded border-white/20 bg-black/40 text-white focus:ring-white/30"
          />
          <span className="text-sm text-neutral-200">Włącz automatyczne doładowanie</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Próg ({CREDIT_SHORT})
            </span>
            <input
              name="thresholdPln"
              type="text"
              inputMode="decimal"
              defaultValue={local.thresholdPln}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-white focus:border-white/35 focus:outline-none"
            />
            <span className="text-[10px] text-neutral-500">
              Gdy saldo spadnie poniżej tej liczby kredytów.
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Kwota doładowania ({CREDIT_SHORT})
            </span>
            <input
              name="topupAmountPln"
              type="text"
              inputMode="decimal"
              defaultValue={local.topupAmountPln}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-white focus:border-white/35 focus:outline-none"
            />
            <span className="text-[10px] text-neutral-500">
              Stripe pobierze równowartość w PLN (1 zł = 1 kredyt).
            </span>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide flex items-center gap-2">
            <Landmark className="h-3.5 w-3.5" />
            Karta (rekord Stripe w bazie)
          </span>
          {/* hidden input utrzymuje pole `localPaymentMethodId` w FormData */}
          <input type="hidden" name="localPaymentMethodId" value={cardId} />
          <Select
            value={cardId}
            onChange={setCardId}
            aria-label="Karta (rekord Stripe w bazie)"
            options={[
              {
                value: '',
                label: 'Automatycznie — pierwszy zapis na koncie lub domyślna przy Stripe Checkout',
              },
              ...savedCards.map((c) => ({
                value: c.id,
                label: `${(c.brand ?? 'Karta').toUpperCase()} •••• ${c.last4 ?? '····'}${
                  c.isDefault ? ' (domyślna)' : ''
                }`,
              })),
            ]}
          />
        </label>

        {savedCards.length === 0 ? (
          <p className="text-xs text-amber-200/90 border border-amber-400/15 bg-amber-400/5 rounded-xl px-3 py-2">
            Lista kart w bazie jest pusta — wybierz &quot;(Automatycznie)&quot;. Po udanym doładowaniu przez Stripe lub gdy ustawisz
            domyślną kartę przy kliencie Stripe, kolejne próby użyją zapisanego <code className="text-amber-100">pm_</code>.
          </p>
        ) : null}

        {local.lastAttemptAt ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <RefreshCw className="h-3.5 w-3.5" />
            Ostatnia próba:{' '}
            {new Date(local.lastAttemptAt).toLocaleString('pl-PL')}{' '}
            {local.lastAttemptOk === true
              ? '— OK'
              : local.lastAttemptOk === false
                ? '— niepowodzenie'
                : ''}
            {local.lastAttemptError ? (
              <span className="text-rose-200/90 block w-full mt-1">{local.lastAttemptError}</span>
            ) : null}
            {local.cooldownUntil ? (
              <span className="text-neutral-400 block w-full">
                Cooldown do: {new Date(local.cooldownUntil).toLocaleString('pl-PL')}
              </span>
            ) : null}
          </div>
        ) : null}

        {local.totalToppedUpCount != null && local.totalToppedUpCount > 0 ? (
          <p className="text-xs text-neutral-500">
            Łącznie auto-doładowań: {local.totalToppedUpCount}
            {local.totalToppedUpAmountPln
              ? ` • suma ${formatCredits(local.totalToppedUpAmountPln)} (${pluralCredits(Number.parseFloat(local.totalToppedUpAmountPln) || 0)})`
              : ''}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Zapisz ustawienia
        </button>

        {error ? (
          <p className="text-sm rounded-xl border border-rose-400/25 bg-rose-400/5 px-4 py-2 text-rose-100">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
