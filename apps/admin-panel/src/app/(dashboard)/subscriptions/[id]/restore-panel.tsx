'use client';

import { Select } from '@/components/select';
import { useEffect, useState } from 'react';
import { fetchRestoreDataAction, startRestoreAction, type KopiaKonta, type StanOdtwarzania } from './restore-actions';

const STATUS: Record<string, string> = {
  QUEUED: 'w kolejce',
  RUNNING: 'przygotowanie',
  SAFETY_BACKUP: 'kopia bezpieczeństwa',
  RESTORING: 'odtwarzanie',
  COMPLETED: 'zlecone serwerowi',
  FAILED: 'nieudane',
};

/**
 * H-18 — odtworzenie konta przez operatora. Nadpisuje dane na żywym koncie, więc
 * operator przepisuje domenę (jak klient w swoim panelu), a kopia bezpieczeństwa
 * jest domyślnie włączona.
 */
export function RestorePanel({ subscriptionId, domain }: { subscriptionId: string; domain: string }) {
  const [backups, setBackups] = useState<KopiaKonta[] | null>(null);
  const [last, setLast] = useState<StanOdtwarzania>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [backupId, setBackupId] = useState('');
  const [scope, setScope] = useState({ scopeFiles: true, scopeDatabases: true, scopeEmail: false });
  const [safetyBackup, setSafetyBackup] = useState(true);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = () => {
    void fetchRestoreDataAction(subscriptionId).then((r) => {
      if ('error' in r) return setLoadErr(r.error);
      setBackups(r.backups);
      setLast(r.last);
      setLoadErr(r.fetchError);
      setBackupId((cur) => cur || r.backups[0]?.id || '');
    });
  };
  useEffect(load, [subscriptionId]);

  const active = last && ['QUEUED', 'RUNNING', 'SAFETY_BACKUP', 'RESTORING'].includes(last.status);
  const ok = backupId && confirm.trim().toLowerCase() === domain.toLowerCase() && (scope.scopeFiles || scope.scopeDatabases || scope.scopeEmail);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const r = await startRestoreAction(subscriptionId, { backupId, ...scope, safetyBackup });
    setBusy(false);
    if ('error' in r) return setMsg({ type: 'err', text: r.error });
    setMsg({ type: 'ok', text: 'Odtworzenie zlecone. Status odświeży się poniżej.' });
    setConfirm('');
    load();
  };

  const box = (key: keyof typeof scope, label: string) => (
    <label className="flex items-center gap-2 text-sm text-neutral-200">
      <input type="checkbox" checked={scope[key]} onChange={(e) => setScope({ ...scope, [key]: e.target.checked })} disabled={busy} />
      {label}
    </label>
  );

  return (
    <div className="space-y-3">
      {last ? (
        <p className="text-xs text-neutral-400">
          Ostatnie: <span className="font-mono text-neutral-200">{last.backupFileName}</span> · {STATUS[last.status] ?? last.status} ·{' '}
          {new Date(last.createdAt).toLocaleString('pl-PL')}
          {last.error ? <span className="block text-rose-300">{last.error}</span> : null}
        </p>
      ) : null}
      {loadErr ? <p className="text-sm text-amber-200">{loadErr}</p> : null}
      {backups === null ? (
        <p className="text-sm text-muted-foreground">Wczytywanie kopii…</p>
      ) : backups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Na koncie nie ma kopii do odtworzenia.</p>
      ) : (
        <>
          <Select
            id="restore-backup"
            aria-label="Kopia do odtworzenia"
            value={backupId}
            onChange={setBackupId}
            disabled={busy}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"
            options={backups.map((b) => ({ value: b.id, label: b.fileName }))}
          />
          <div className="flex flex-wrap gap-4">
            {box('scopeFiles', 'Pliki')}
            {box('scopeDatabases', 'Bazy danych')}
            {box('scopeEmail', 'Poczta')}
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={safetyBackup} onChange={(e) => setSafetyBackup(e.target.checked)} disabled={busy} />
            Najpierw kopia bezpieczeństwa obecnego stanu (zalecane)
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">Odtworzenie nadpisze dane na żywym koncie. Wpisz domenę, żeby potwierdzić: {domain}</span>
            <input
              id="restore-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !ok || !!active}
            className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
          >
            {active ? 'Odtwarzanie w toku' : busy ? 'Zlecanie…' : 'Odtwórz konto z kopii'}
          </button>
        </>
      )}
      {msg ? <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p> : null}
    </div>
  );
}
