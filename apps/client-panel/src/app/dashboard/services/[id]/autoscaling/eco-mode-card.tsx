'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Leaf, Loader2, Sparkles } from 'lucide-react';
import { patchSubscriptionEcoMode } from '../eco-mode-actions';
import { ECO_FIRST_ENABLE_POINTS } from '@/lib/eco-point-rules';

interface Props {
  subscriptionId: string;
  ecoModeEnabled: boolean;
  ecoPoints: number;
}

export function EcoModeCard({ subscriptionId, ecoModeEnabled: initial, ecoPoints }: Props) {
  const [eco, setEco] = useState(initial);
  const [points, setPoints] = useState(ecoPoints);
  const [error, setError] = useState<string | null>(null);
  const [daInfo, setDaInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const label = useMemo(
    () =>
      eco
        ? 'Włączone — mniej agresywne kopie zapasowe i przyjazne działanie środowisku.'
        : 'Wyłączone — pełny rytm utrzymaniowy jak w domyślnej konfiguracji.',
    [eco],
  );

  const onToggle = (next: boolean) => {
    setError(null);
    setDaInfo(null);
    startTransition(async () => {
      const prev = eco;
      setEco(next);
      const res = await patchSubscriptionEcoMode(subscriptionId, next);
      if ('error' in res) {
        setEco(prev);
        setError(res.error);
        return;
      }
      if (res.ecoPointsAwarded) {
        setPoints((p) => p + ECO_FIRST_ENABLE_POINTS);
      }
      if (res.ecoDaNotice) {
        setDaInfo(res.ecoDaNotice);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Leaf className="h-5 w-5 text-emerald-400" />
            Tryb EKO
          </h2>
          <p className="mt-1 text-xs text-neutral-400">{label}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-300">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400/80" />
              Twoje punkty EKO: <span className="font-semibold text-white">{points}</span>
            </span>
            <Link href="/dashboard/eco" className="text-emerald-400/90 hover:text-emerald-300 underline-offset-2 hover:underline">
              Jak zdobywać punkty →
            </Link>
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <input
          type="checkbox"
          checked={eco}
          disabled={pending}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-white/20 bg-black accent-emerald-500"
        />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">Oszczędzaj energię i nagradzaj EKO</div>
          <p className="mt-1 text-xs text-neutral-500">
            Pierwsze włączenie na tej usłudze daje +5 pkt EKO (raz na usługę). Tryb zmniejsza częstotliwość
            kopii zapasowych — mniejsze obciążenie serwera.
          </p>
        </div>
        {pending ? <Loader2 className="h-5 w-5 animate-spin text-emerald-400 shrink-0" /> : null}
      </label>

      {error ? (
        <div className="text-sm text-rose-300 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          {error}
        </div>
      ) : null}
      {daInfo ? (
        <div className="text-sm text-emerald-200/90 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          {daInfo}
        </div>
      ) : null}
    </div>
  );
}
