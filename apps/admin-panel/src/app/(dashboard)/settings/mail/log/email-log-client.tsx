'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { fetchEmailLog, type EmailLogItem, type EmailLogPage } from './actions';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Wszystkie' },
  { value: 'SENT', label: 'Wysłane' },
  { value: 'FAILED', label: 'Nieudane' },
  { value: 'SUPPRESSED', label: 'Wstrzymane' },
  { value: 'QUEUED', label: 'W kolejce' },
  { value: 'BOUNCED', label: 'Odbite' },
];

function statusBadge(status: string): string {
  switch (status) {
    case 'SENT':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'FAILED':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'BOUNCED':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'SUPPRESSED':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    default:
      return 'bg-white/10 text-white/70 border-white/20';
  }
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function EmailLogClient() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<EmailLogItem[]>([]);
  const [stats, setStats] = useState<EmailLogPage['stats'] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchEmailLog({
          status: status || undefined,
          q: q || undefined,
          cursor: reset ? undefined : cursor ?? undefined,
        });
        setStats(page.stats);
        setCursor(page.nextCursor);
        setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Nie udało się pobrać dziennika.');
      } finally {
        setLoading(false);
      }
    },
    [status, q, cursor],
  );

  // Reload from scratch when filter/query changes.
  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-4">
      {stats ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <Stat label="Razem" value={stats.total} />
          <Stat label="Wysłane" value={stats.sent} tone="emerald" />
          <Stat label="Nieudane" value={stats.failed} tone="rose" />
          <Stat label="Wstrzymane" value={stats.suppressed} tone="amber" />
          <Stat label="W kolejce" value={stats.queued} />
          <Stat label="Odbite" value={stats.bounced} tone="orange" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setStatus(f.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              status === f.value
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load(true);
            }}
            placeholder="Szukaj po temacie…"
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white focus:border-emerald-500/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Odśwież
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/50">
            <tr>
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Odbiorca</th>
              <th className="px-4 py-2.5">Temat / tag</th>
              <th className="px-4 py-2.5">Provider</th>
              <th className="px-4 py-2.5">Błąd</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.map((it) => (
              <tr key={it.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-2.5 text-white/70">{fmt(it.createdAt)}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${statusBadge(it.status)}`}>
                    {it.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-white/80">{it.toEmail}</td>
                <td className="px-4 py-2.5 text-white/80">
                  <div>{it.subject}</div>
                  {it.tag ? <div className="text-xs text-white/40">{it.tag}</div> : null}
                </td>
                <td className="px-4 py-2.5 text-white/60">{it.providerId ?? '—'}</td>
                <td className="max-w-xs px-4 py-2.5 text-xs text-rose-300/80">{it.errorMessage ?? ''}</td>
              </tr>
            ))}
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                  Brak wpisów dla wybranego filtra.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {cursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void load(false)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Załaduj więcej
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'emerald' | 'rose' | 'amber' | 'orange';
}) {
  const toneCls =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'rose'
        ? 'text-rose-300'
        : tone === 'amber'
          ? 'text-amber-300'
          : tone === 'orange'
            ? 'text-orange-300'
            : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
      <div className={`text-lg font-bold ${toneCls}`}>{value}</div>
      <div className="text-xs text-white/50">{label}</div>
    </div>
  );
}
