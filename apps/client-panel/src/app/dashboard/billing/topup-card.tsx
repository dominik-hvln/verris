'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Loader2, BadgePercent, X, CheckCircle2 } from 'lucide-react';
import { CREDIT_SHORT, formatCredits, pluralCredits } from '@/lib/credits';
import type { PreviewTopupPromoResponse } from '@verris/contracts';
import { previewTopupPromoAction, startTopupAction } from './actions';
import { TOPUP_PRESETS } from './constants';

interface Props {
  balance: string;
}

interface PromoState {
  status: 'idle' | 'pending' | 'applied' | 'error';
  preview?: PreviewTopupPromoResponse;
  error?: string;
}

export function TopupCard({ balance }: Props) {
  const [amount, setAmount] = useState<string>('50');
  const [promoCode, setPromoCode] = useState<string>('');
  const [promoState, setPromoState] = useState<PromoState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewCredits = useMemo(() => {
    const parsed = Number.parseFloat(amount);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [amount]);

  // Re-validate the promo whenever the amount changes (debounced).
  useEffect(() => {
    if (promoState.status !== 'applied' || !promoState.preview) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runPreview(amount, promoState.preview!.code);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const runPreview = async (rawAmount: string, code: string) => {
    setPromoState({ status: 'pending' });
    const res = await previewTopupPromoAction(rawAmount, code);
    if (res.ok) {
      setPromoState({ status: 'applied', preview: res.preview });
    } else {
      setPromoState({ status: 'error', error: res.error });
    }
  };

  const onApplyPromo = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runPreview(amount, promoCode);
  };

  const onClearPromo = () => {
    setPromoCode('');
    setPromoState({ status: 'idle' });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (promoState.status === 'applied' && promoState.preview) {
      formData.set('promoCode', promoState.preview.code);
    } else {
      formData.delete('promoCode');
    }
    startTransition(async () => {
      const res = await startTopupAction(formData);
      if (!res.ok && res.error) setError(res.error);
    });
  };

  return (
    <section className="rounded-[10px] border border-line bg-card">
      <div className="px-4 pb-4 pt-3.5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Doładuj portfel</h3>
          <span className="font-mono text-xs text-muted-foreground" data-tip={`Saldo teraz\n${formatCredits(balance)}`}>
            saldo {formatCredits(balance)}
          </span>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-5 gap-2">
            {TOPUP_PRESETS.map((preset) => {
              const active = amount === String(preset);
              return (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setAmount(String(preset))}
                  aria-pressed={active}
                  className={`rounded-[7px] border px-2 py-2 text-sm tabular-nums transition-colors ${
                    active
                      ? 'border-primary bg-data-soft font-semibold text-foreground'
                      : 'border-line-strong bg-card text-verris-body hover:border-primary'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                name="amount"
                min={5}
                max={10000}
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full rounded-[7px] border border-line-strong bg-background px-3 py-2.5 pr-14 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                PLN
              </span>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-[7px] border border-primary bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? 'Przekierowanie…' : 'Doładuj'}
            </button>
          </div>
          {previewCredits !== null ? (
            <p className="text-xs text-emerald-200/90">
              Otrzymasz {formatCredits(previewCredits, { signed: true })} ({previewCredits.toFixed(2)}{' '}
              {pluralCredits(previewCredits)}) na portfel.
              {promoState.status === 'applied' && promoState.preview ? (
                <>
                  {' '}+ <strong>{promoState.preview.bonusAmount} {CREDIT_SHORT}</strong> bonusu z
                  kodu „{promoState.preview.code}" ({promoState.preview.percent}%) — łącznie{' '}
                  <strong>{promoState.preview.totalCredited} {CREDIT_SHORT}</strong>.
                </>
              ) : null}
            </p>
          ) : null}

          <PromoSubform
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            promoState={promoState}
            onApply={onApplyPromo}
            onClear={onClearPromo}
          />

          {error ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
          <p className="font-mono text-[11.5px] leading-relaxed text-muted-foreground">
            Płatność realizowana przez Stripe (karta + BLIK + Przelewy24) w PLN. Środki trafią do
            portfela natychmiast po zaksięgowaniu. Bonus z kodu procentowego dolicza się po
            zaksięgowaniu wpłaty.
          </p>
        </form>
      </div>
    </section>
  );
}

function PromoSubform({
  promoCode,
  setPromoCode,
  promoState,
  onApply,
  onClear,
}: {
  promoCode: string;
  setPromoCode: (v: string) => void;
  promoState: PromoState;
  onApply: (event: React.FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
}) {
  if (promoState.status === 'applied' && promoState.preview) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 text-sm text-emerald-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Kod <strong>{promoState.preview.code}</strong> ({promoState.preview.percent}%) — bonus{' '}
            +{promoState.preview.bonusAmount} {CREDIT_SHORT}.
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg p-1 text-emerald-200 hover:bg-emerald-400/10"
          aria-label="Usuń kod promocyjny"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onApply} className="flex items-stretch gap-2">
      <div className="relative flex-1">
        <BadgePercent className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          value={promoCode}
          onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
          placeholder="Kod promocyjny (opcjonalnie)"
          maxLength={40}
          className="w-full rounded-2xl border border-white/10 bg-black/40 pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-500 uppercase tracking-wider focus:border-white/40 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={promoState.status === 'pending' || promoCode.trim().length < 3}
        className="rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {promoState.status === 'pending' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          'Sprawdź'
        )}
      </button>
      {promoState.status === 'error' ? (
        <p className="absolute mt-12 text-xs text-rose-300">{promoState.error}</p>
      ) : null}
    </form>
  );
}
