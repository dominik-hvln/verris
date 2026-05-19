'use client';

import { useState } from 'react';
import { Button } from '@verris/ui';
import { formatCredits } from '@/lib/credits';
import { redeemEcoPointsAction } from './eco-actions';

interface Props {
  maxPoints: number;
}

const OPTIONS = [100, 200, 500, 1000];

export function EcoRedeemForm({ maxPoints }: Props) {
  const [points, setPoints] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const allowedOptions = OPTIONS.filter((p) => p <= maxPoints);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <label className="block flex-1 space-y-1 lg:max-w-md">
          <span className="text-xs text-neutral-400">Ile punktów wymienić</span>
          <select
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            disabled={busy || allowedOptions.length === 0}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white"
          >
            {allowedOptions.length === 0 ? (
              <option value={100}>Potrzeba min. 100 pkt</option>
            ) : (
              allowedOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} pkt → {formatCredits(opt / 10)} do portfela
                </option>
              ))
            )}
          </select>
        </label>
        <Button
          type="button"
          disabled={busy || maxPoints < 100}
          className="bg-emerald-700 hover:bg-emerald-600 text-white"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await redeemEcoPointsAction(points);
            setBusy(false);
            if ('error' in r) setMsg({ type: 'err', text: r.error });
            else
              setMsg({
                type: 'ok',
                text: `Wymiana zakończona: ${formatCredits(r.creditedAmount, { signed: true })} do portfela.`,
              });
          }}
        >
          Wymień punkty
        </Button>
      </div>
      {msg ? <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p> : null}
    </div>
  );
}
