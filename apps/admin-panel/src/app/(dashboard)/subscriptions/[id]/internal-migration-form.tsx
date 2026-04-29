'use client';

import { useState } from 'react';
import { requestInternalMigrationAction } from './migration-actions';

interface ServerOption {
  id: string;
  name: string | null;
  region: string | null;
}

export function InternalMigrationForm({
  subscriptionId,
  currentServerId,
  servers,
}: {
  subscriptionId: string;
  currentServerId: string | null;
  servers: ServerOption[];
}) {
  const candidates = servers.filter((s) => s.id !== currentServerId);
  const [targetServerId, setTargetServerId] = useState(candidates[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const res = await requestInternalMigrationAction({
          subscriptionId,
          targetServerId,
          notes: notes.trim() || undefined,
        });
        setBusy(false);
        if ('error' in res) setMsg({ type: 'err', text: res.error });
        else setMsg({ type: 'ok', text: 'Zlecono migrację wewnętrzną. Worker przygotuje backup i ticket.' });
      }}
    >
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Docelowy węzeł</span>
        <select
          value={targetServerId}
          onChange={(e) => setTargetServerId(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          disabled={busy || candidates.length === 0}
        >
          {candidates.length === 0 ? (
            <option value="">Brak innego aktywnego węzła</option>
          ) : (
            candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.name ?? s.id).slice(0, 24)} {s.region ? `(${s.region})` : ''}
              </option>
            ))
          )}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Notatki</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full min-h-[72px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
      </label>
      {msg ? <p className={`text-xs ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p> : null}
      <button
        type="submit"
        disabled={busy || !targetServerId}
        className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        Zleć migrację wewnętrzną
      </button>
    </form>
  );
}

