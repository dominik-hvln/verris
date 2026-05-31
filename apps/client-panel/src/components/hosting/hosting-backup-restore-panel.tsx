'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Archive, ExternalLink, Loader2, RotateCcw, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  fetchHostingBackupsAction,
  fetchHostingRestorePreviewAction,
  enqueueHostingRestoreAction,
  fetchHostingRestoreStatusAction,
  type HostingRestoreJobDto,
} from '@/app/dashboard/services/[id]/hosting-backup-actions';
import { fetchServiceDetailsAction } from '@/app/dashboard/services/[id]/hosting-service-actions';
import type { HostingRestorePreview } from '@/app/dashboard/hosting-tools-data';
import type { HostingBackupsResponseDto } from '@verris/contracts';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';

const STATUS_LABEL: Record<HostingRestoreJobDto['status'], string> = {
  QUEUED: 'W kolejce',
  RUNNING: 'Uruchamianie',
  SAFETY_BACKUP: 'Tworzę kopię zabezpieczającą',
  RESTORING: 'Przywracanie danych',
  COMPLETED: 'Zakończone',
  FAILED: 'Błąd',
};

export function HostingBackupRestorePanel({ serviceId }: { serviceId: string }) {
  const [backups, setBackups] = useState<HostingBackupsResponseDto | null>(null);
  const [preview, setPreview] = useState<HostingRestorePreview | null>(null);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore form state
  const [scopeFiles, setScopeFiles] = useState(true);
  const [scopeDatabases, setScopeDatabases] = useState(true);
  const [scopeEmail, setScopeEmail] = useState(true);
  const [safetyBackup, setSafetyBackup] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [job, setJob] = useState<HostingRestoreJobDto | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, details, status] = await Promise.all([
        fetchHostingBackupsAction(serviceId),
        fetchServiceDetailsAction(serviceId).catch(() => null),
        fetchHostingRestoreStatusAction(serviceId).catch(() => null),
      ]);
      setBackups(list);
      setDomain(details?.account?.domain ?? null);
      setJob(status);
      const firstId = list.rows[0]?.id ?? list.rows[0]?.fileName ?? null;
      setSelectedBackupId(firstId);
      setPreview(await fetchHostingRestorePreviewAction(serviceId, firstId ?? undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać kopii zapasowych.');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll job status while a restore is active.
  useEffect(() => {
    if (job?.active) {
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          const s = await fetchHostingRestoreStatusAction(serviceId).catch(() => null);
          if (s) setJob(s);
          if (s && !s.active && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 5_000);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job?.active, serviceId]);

  const selectBackup = async (backupId: string) => {
    setSelectedBackupId(backupId);
    try {
      setPreview(await fetchHostingRestorePreviewAction(serviceId, backupId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się załadować podglądu restore.');
    }
  };

  const confirmMatches = domain ? confirmText.trim().toLowerCase() === domain.toLowerCase() : confirmText.length > 0;
  const canRestore =
    Boolean(selectedBackupId) &&
    (scopeFiles || scopeDatabases || scopeEmail) &&
    confirmMatches &&
    !submitting &&
    !job?.active;

  const runRestore = async () => {
    if (!selectedBackupId) return;
    setSubmitting(true);
    setRestoreError(null);
    try {
      const result = await enqueueHostingRestoreAction(serviceId, {
        backupId: selectedBackupId,
        scopeFiles,
        scopeDatabases,
        scopeEmail,
        safetyBackup,
        confirmDomain: confirmText.trim(),
      });
      setJob(result);
      setConfirmText('');
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Nie udało się uruchomić przywracania.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Kopie zapasowe i przywracanie</p>
          <p className="text-xs text-neutral-500">
            Przywróć konto z wybranej kopii. Operacja nadpisuje wybrane dane.
          </p>
        </div>
        <Link
          href={`/dashboard/backups?serviceId=${encodeURIComponent(serviceId)}`}
          className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100"
        >
          Pełny panel backupów
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Wczytywanie…
        </p>
      ) : null}
      {error ? <p className="text-sm text-rose-200">{error}</p> : null}

      {/* Active / last job status */}
      {job ? (
        <div
          className={`rounded-xl border p-3 text-sm ${
            job.status === 'FAILED'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : job.status === 'COMPLETED'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'
          }`}
        >
          <div className="flex items-center gap-2">
            {job.active ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : job.status === 'COMPLETED' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <span className="font-medium">{STATUS_LABEL[job.status]}</span>
            <span className="text-xs opacity-80">· {job.backupFileName}</span>
          </div>
          {job.error ? <p className="mt-1 text-xs">{job.error}</p> : null}
          {job.status === 'COMPLETED' ? (
            <p className="mt-1 text-xs opacity-80">Dane zostały przywrócone z kopii.</p>
          ) : null}
        </div>
      ) : null}

      {/* Backup picker */}
      {backups && backups.rows.length > 0 ? (
        <ul className="space-y-2">
          {backups.rows.slice(0, 6).map((row) => {
            const id = row.id ?? row.fileName;
            const active = selectedBackupId === id;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => void selectBackup(id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                    active
                      ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100'
                      : 'border-white/10 bg-black/30 text-neutral-200 hover:border-white/20'
                  }`}
                >
                  <Archive className="h-4 w-4 shrink-0 text-neutral-400" />
                  <span className="truncate">{row.fileName}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : backups && !backups.fetchError && !loading ? (
        <p className="text-sm text-neutral-500">Brak archiwów backup na koncie.</p>
      ) : null}
      {backups?.fetchError ? (
        <p className="text-xs text-amber-200">{hostingFetchErrorMessage(backups.fetchError)}</p>
      ) : null}

      {/* Restore form */}
      {selectedBackupId && !job?.active ? (
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
          {preview?.backup ? (
            <p className="text-xs text-neutral-400">
              Zakres podglądu:{' '}
              {preview.restoreScope
                .map((item) => `${item.area}${item.count === null ? '' : ` (${item.count})`}`)
                .join(' · ')}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3 text-sm text-neutral-200">
            <ScopeToggle label="Pliki / FTP" checked={scopeFiles} onChange={setScopeFiles} />
            <ScopeToggle label="Bazy danych" checked={scopeDatabases} onChange={setScopeDatabases} />
            <ScopeToggle label="Poczta" checked={scopeEmail} onChange={setScopeEmail} />
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              checked={safetyBackup}
              onChange={(e) => setSafetyBackup(e.target.checked)}
              className="h-4 w-4 accent-emerald-400"
            />
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            Zrób kopię zabezpieczającą tuż przed przywracaniem (zalecane)
          </label>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            Przywracanie nadpisze wybrane dane na koncie. Aby potwierdzić, wpisz nazwę domeny
            {domain ? <span className="font-mono"> {domain}</span> : ''}:
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={domain ?? 'twoja-domena.pl'}
              spellCheck={false}
              autoCapitalize="off"
              className="mt-2 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white placeholder:text-neutral-500 focus:border-amber-400/50 focus:outline-none"
            />
          </div>

          {restoreError ? <p className="text-sm text-rose-200">{restoreError}</p> : null}

          <button
            type="button"
            onClick={() => void runRestore()}
            disabled={!canRestore}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 hover:bg-rose-500/25 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Przywróć z tej kopii
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ScopeToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-cyan-400"
      />
      {label}
    </label>
  );
}
