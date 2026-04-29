'use client';

import { useState, useTransition } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { startTopupAction, TOPUP_PRESETS } from './actions';

interface Props {
  balance: string;
  currency: string;
}

export function TopupCard({ balance, currency }: Props) {
  const [amount, setAmount] = useState<string>('50');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await startTopupAction(formData);
      if (!res.ok && res.error) setError(res.error);
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] p-px shadow-2xl">
      <div className="relative h-full w-full bg-neutral-950/90 backdrop-blur-3xl rounded-[calc(32px-1px)] p-8">
        <div className="flex items-center gap-3 mb-4">
          <Wallet className="w-5 h-5 text-neutral-300" />
          <h3 className="text-sm font-semibold text-neutral-400 tracking-wider uppercase">
            Aktualne saldo
          </h3>
        </div>
        <div className="text-5xl font-black text-white tracking-tight mb-2">
          {balance} <span className="text-2xl text-neutral-400">{currency}</span>
        </div>
        <p className="text-sm text-neutral-500 mb-8">
          Saldo zostanie pomniejszone o opłaty subskrypcyjne i autoskalowanie.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-5 gap-2">
            {TOPUP_PRESETS.map((preset) => {
              const active = amount === String(preset);
              return (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setAmount(String(preset))}
                  className={`rounded-2xl border px-3 py-2 text-sm font-bold transition-all ${
                    active
                      ? 'border-white bg-white text-black'
                      : 'border-white/10 bg-white/[0.03] text-neutral-200 hover:border-white/30'
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
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 pr-16 text-white placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                {currency}
              </span>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? 'Przekierowanie…' : 'Doładuj'}
            </button>
          </div>
          {error ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
          <p className="text-xs text-neutral-500">
            Płatność realizowana przez Stripe (karta + BLIK + Przelewy24). Środki trafią do
            portfela natychmiast po zaksięgowaniu.
          </p>
        </form>
      </div>
    </div>
  );
}
