'use client';

import { useState } from 'react';
import { Button } from '@ekohost/ui';
import { applyReferralCodeAction } from './eco-actions';

export function ReferralApplyForm() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <div className="max-w-xl space-y-3">
      <form
        className="flex flex-col sm:flex-row gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          setBusy(true);
          const r = await applyReferralCodeAction(code);
          setBusy(false);
          if ('error' in r) setMsg({ type: 'err', text: r.error });
          else {
            setMsg({ type: 'ok', text: 'Kod zapisany — punkty zostały dodane Tobie i polecającemu.' });
            setCode('');
          }
        }}
      >
        <input
          className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white font-mono uppercase placeholder:normal-case"
          placeholder="np. EKO-AB12CD34"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={busy} className="bg-emerald-700 hover:bg-emerald-600 text-white">
          Zastosuj kod
        </Button>
      </form>
      {msg ? (
        <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p>
      ) : null}
    </div>
  );
}
