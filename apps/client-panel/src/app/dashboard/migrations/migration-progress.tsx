'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@verris/ui';
import {
  cancelMigrationBundleAction,
  getMigrationBundleDetailAction,
  getMigrationCutoverPlanAction,
  queueMigrationDeltaSyncAction,
  verifyMigrationCutoverAction,
} from './actions';
import {
  JOB_LABELS,
  STATUS_LABELS,
  type CutoverPlan,
  type MigrationBundleDetail,
  type MigrationBundleSummary,
  type MigrationIntegrity,
  type MigrationJobView,
} from './types';

interface Props {
  serviceId: string;
  initial: MigrationBundleSummary;
}

const ACTIVE = new Set(['QUEUED', 'RUNNING']);

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let u = 0;
  while (size >= 1024 && u < units.length - 1) {
    size /= 1024;
    u += 1;
  }
  return `${size < 10 && u > 0 ? size.toFixed(1) : Math.round(size)} ${units[u]}`;
}

export function MigrationProgress({ serviceId, initial }: Props) {
  const [detail, setDetail] = useState<MigrationBundleDetail | null>(null);
  const [summary, setSummary] = useState<MigrationBundleSummary>(initial);
  const [cutover, setCutover] = useState<CutoverPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await getMigrationBundleDetailAction({ serviceId, migrationId: initial.id });
    if ('ok' in res) {
      const d = res.detail as MigrationBundleDetail;
      setDetail(d);
      setSummary(d);
    }
  }, [serviceId, initial.id]);

  useEffect(() => {
    void refresh();
    const active = ACTIVE.has(summary.status);
    if (!active) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, summary.status]);

  const loadCutover = useCallback(async () => {
    const res = await getMigrationCutoverPlanAction({ serviceId, migrationId: initial.id });
    if ('ok' in res) setCutover(res.plan as CutoverPlan);
  }, [serviceId, initial.id]);

  useEffect(() => {
    if (summary.status === 'COMPLETED') void loadCutover();
  }, [summary.status, loadCutover]);

  const jobs = detail?.jobs ?? [];
  const total = jobs.length;
  const done = jobs.filter((j) => j.status === 'COMPLETED').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : summary.status === 'COMPLETED' ? 100 : 0;

  async function runDelta() {
    setBusy('delta');
    setMsg(null);
    const res = await queueMigrationDeltaSyncAction({ serviceId, migrationId: initial.id });
    setBusy(null);
    if ('error' in res) {
      setMsg(res.error);
      return;
    }
    setMsg('Dosynchronizowanie plików i poczty uruchomione.');
    await refresh();
  }

  async function verifyDns() {
    setBusy('verify');
    setMsg(null);
    const res = await verifyMigrationCutoverAction({ serviceId, migrationId: initial.id });
    setBusy(null);
    if ('error' in res) {
      setMsg(res.error);
      return;
    }
    setCutover(res.plan as CutoverPlan);
  }

  async function cancel() {
    if (typeof window !== 'undefined' && !window.confirm('Anulować tę migrację? Przeniesione dotąd dane zostaną na koncie, ale proces się zatrzyma.')) {
      return;
    }
    setBusy('cancel');
    setMsg(null);
    const res = await cancelMigrationBundleAction({ serviceId, migrationId: initial.id });
    setBusy(null);
    if ('error' in res) {
      setMsg(res.error);
      return;
    }
    setMsg('Migracja została anulowana.');
    await refresh();
  }

  const cancelable = summary.status === 'QUEUED' || summary.status === 'RUNNING' || summary.status === 'ATTENTION';

  return (
    <article className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            {summary.targetDomain ?? 'Migracja'} <span className="text-neutral-500">#{summary.id.slice(0, 8)}</span>
          </p>
          <p className="text-xs text-neutral-500">
            Rozpoczęto {new Date(summary.createdAt).toLocaleString('pl-PL')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={summary.status} />
          {cancelable ? (
            <button
              type="button"
              disabled={busy === 'cancel'}
              onClick={cancel}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-neutral-400 hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-50"
            >
              {busy === 'cancel' ? 'Anuluję…' : 'Anuluj'}
            </button>
          ) : null}
        </div>
      </header>

      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${summary.status === 'FAILED' || summary.status === 'ATTENTION' ? 'bg-amber-500' : 'bg-cyan-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {summary.status === 'ATTENTION' ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100/90">
          Migrację przejął nasz zespół{summary.attentionReason ? `: ${summary.attentionReason}` : ''}.
          Zajmiemy się nią i damy znać e-mailem. Nie musisz nic robić.
        </p>
      ) : null}

      <ol className="space-y-1.5">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
        {jobs.length === 0 ? <li className="text-xs text-neutral-500">Przygotowuję kroki migracji…</li> : null}
      </ol>

      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Pliki" value={`${summary.filesTransferred} · ${formatBytes(summary.bytesTransferred)}`} />
        <Stat label="Bazy" value={String(summary.databasesMigrated)} />
        <Stat label="Skrzynki" value={String(summary.mailboxesMigrated)} />
      </dl>

      {summary.status === 'COMPLETED' && cutover ? (
        <CutoverPanel
          plan={cutover}
          busy={busy}
          onDelta={runDelta}
          onVerify={verifyDns}
        />
      ) : null}

      {msg ? <p className="text-xs text-cyan-300">{msg}</p> : null}
    </article>
  );
}

function JobRow({ job }: { job: MigrationJobView }) {
  const icon =
    job.status === 'COMPLETED' ? '✓'
      : job.status === 'RUNNING' ? '⟳'
        : job.status === 'FAILED' ? '✕'
          : job.status === 'RETRYING' ? '↻'
            : '•';
  const color =
    job.status === 'COMPLETED' ? 'text-emerald-400'
      : job.status === 'RUNNING' ? 'text-cyan-400 animate-pulse'
        : job.status === 'FAILED' ? 'text-rose-400'
          : job.status === 'RETRYING' ? 'text-amber-400'
            : 'text-neutral-500';
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 ${color}`} aria-hidden>{icon}</span>
      <span className="flex-1">
        <span className="text-neutral-200">{JOB_LABELS[job.kind] ?? job.kind}</span>
        {job.status === 'RUNNING' && job.progress?.note ? (
          <span className="ml-2 text-xs text-neutral-500">
            {job.progress.note}
            {Number(job.progress.bytes) > 0 ? ` — ${formatBytes(job.progress.bytes)}` : ''}
          </span>
        ) : null}
        {job.status === 'RETRYING' ? <span className="ml-2 text-xs text-amber-400/80">ponawiam ({job.attempts}/{job.maxAttempts})</span> : null}
        {job.status === 'FAILED' && job.lastError ? <span className="ml-2 text-xs text-rose-400/80">{job.lastError}</span> : null}
        {job.status === 'COMPLETED' && job.integrity ? <IntegrityLine integrity={job.integrity} /> : null}
      </span>
    </li>
  );
}

function IntegrityLine({ integrity }: { integrity: MigrationIntegrity }) {
  let text = '';
  let ok: boolean | null = null;
  if (integrity.kind === 'files') {
    ok = integrity.match;
    text =
      integrity.sourceFiles != null
        ? `${integrity.targetFiles}/${integrity.sourceFiles} plików`
        : `${integrity.targetFiles} plików`;
  } else if (integrity.kind === 'mysql') {
    ok = integrity.match;
    text =
      integrity.sourceRows != null
        ? `${integrity.targetRows}/${integrity.sourceRows} wierszy w ${integrity.targetTables} tab.`
        : `${integrity.targetRows} wierszy w ${integrity.targetTables} tab.`;
  } else {
    ok = integrity.match;
    text =
      integrity.sourceMessages != null
        ? `${integrity.targetMessages ?? 0}/${integrity.sourceMessages} wiadomości`
        : `${integrity.targetMessages ?? 0} wiadomości`;
  }
  const color = ok === false ? 'text-amber-400/90' : 'text-emerald-400/80';
  const icon = ok === false ? '⚠' : ok === true ? '✓' : '·';
  return <span className={`ml-2 text-xs ${color}`}>{icon} {text}</span>;
}

function CutoverPanel({
  plan,
  busy,
  onDelta,
  onVerify,
}: {
  plan: CutoverPlan;
  busy: string | null;
  onDelta: () => void;
  onVerify: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3">
      <p className="text-sm font-semibold text-white">Ostatni krok: przełączenie DNS</p>
      <p className="text-xs text-neutral-300">{plan.message}</p>

      {plan.deltaSyncRecommended ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100/90">
          Od transferu minęło trochę czasu — zalecamy dograć różnice (pliki i nową pocztę) tuż przed przełączeniem.
          <div className="mt-2">
            <Button type="button" disabled={busy === 'delta'} onClick={onDelta} className="bg-amber-600 hover:bg-amber-500 text-white text-xs">
              {busy === 'delta' ? 'Dosynchronizowuję…' : 'Dograj różnice (delta-sync)'}
            </Button>
          </div>
        </div>
      ) : null}

      {plan.status !== 'done' && plan.nameserverOption ? (
        <div className="text-xs text-neutral-300">
          <p className="font-medium text-white">Najprościej: zmień serwery nazw (NS) u rejestratora domeny na:</p>
          <ul className="mt-1 space-y-0.5 font-mono text-cyan-200">
            {plan.nameserverOption.nameservers.map((ns) => (
              <li key={ns}>{ns}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.status !== 'done' && plan.records.length > 0 ? (
        <div className="text-xs">
          <p className="font-medium text-white">…albo ustaw rekordy DNS u obecnego dostawcy:</p>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-1 pr-3">Typ</th>
                  <th className="py-1 pr-3">Nazwa</th>
                  <th className="py-1 pr-3">Wartość</th>
                  <th className="py-1">Priorytet</th>
                </tr>
              </thead>
              <tbody className="font-mono text-neutral-200">
                {plan.records.map((r, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-1 pr-3">{r.type}</td>
                    <td className="py-1 pr-3">{r.name}</td>
                    <td className="py-1 pr-3">{r.value}</td>
                    <td className="py-1">{r.priority ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {plan.status === 'done' ? (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-100/90">
          ✓ DNS wskazuje na nasz serwer{plan.cutoverAt ? ` (od ${new Date(plan.cutoverAt).toLocaleString('pl-PL')})` : ''}. Migracja zakończona w 100%.
        </p>
      ) : (
        <Button type="button" disabled={busy === 'verify'} onClick={onVerify} className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs">
          {busy === 'verify' ? 'Sprawdzam DNS…' : 'Sprawdź DNS'}
        </Button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MigrationBundleSummary['status'] }) {
  const map: Record<string, string> = {
    COMPLETED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    RUNNING: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
    QUEUED: 'border-white/15 bg-white/5 text-neutral-200',
    ATTENTION: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    FAILED: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    CANCELED: 'border-white/10 bg-white/5 text-neutral-400',
    DRAFT: 'border-white/10 bg-white/5 text-neutral-400',
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] ?? map.DRAFT}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 py-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-white">{value}</dd>
    </div>
  );
}
