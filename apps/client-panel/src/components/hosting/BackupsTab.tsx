'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Loader2, RotateCcw, ShieldAlert, Check, X, AlertTriangle } from 'lucide-react';
import type { HostingBackupRowDto } from '@verris/contracts';
import { fetchHostingBackupsAction } from '@/app/dashboard/services/[id]/hosting-extra-actions';
import {
  enqueueHostingRestoreAction,
  fetchHostingRestoreStatusAction,
  type HostingRestoreJobDto,
} from '@/app/dashboard/services/[id]/hosting-backup-actions';
import { BackupNowButton } from '@/app/dashboard/backups/backup-now-button';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { HostingHelpHint } from '@/components/hosting/HostingTabShell';

const STATUS_LABEL: Record<HostingRestoreJobDto['status'], string> = {
  QUEUED: 'W kolejce',
  RUNNING: 'W trakcie',
  SAFETY_BACKUP: 'Kopia bezpieczeństwa',
  RESTORING: 'Przywracanie',
  COMPLETED: 'Zakończono',
  FAILED: 'Błąd',
};

export default function BackupsTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<HostingBackupRowDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [job, setJob] = useState<HostingRestoreJobDto | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    const j = await fetchHostingRestoreStatusAction(serviceId).catch(() => null);
    setJob(j);
    return j;
  }, [serviceId]);

  useEffect(() => {
    setLoading(true);
    void fetchHostingBackupsAction(serviceId)
      .then((res) => {
        setRows(res.rows);
        setError(res.fetchError);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać kopii.'))
      .finally(() => setLoading(false));
    void loadStatus();
  }, [serviceId, loadStatus]);

  // Polling gdy przywracanie jest w toku.
  useEffect(() => {
    const active = job?.active;
    if (active && !pollRef.current) {
      pollRef.current = setInterval(() => void loadStatus(), 5000);
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job?.active, loadStatus]);

  return (
    <div className="space-y-4">
      <HostingHelpHint
        help={{
          blurb:
            'Kopia zapasowa to Twoja siatka bezpieczeństwa. Dodatkowo robimy kopie poza serwerem. Przed dużymi zmianami zrób kopię, a w razie problemu przywróć ją jednym kliknięciem.',
          kbQuery: 'kopie zapasowe',
        }}
      />
      <BackupNowButton serviceId={serviceId} />

      {job && (job.active || job.status === 'COMPLETED' || job.status === 'FAILED') && (
        <RestoreStatusBanner job={job} />
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200/90">
          {hostingFetchErrorMessage(error)}
        </p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-neutral-500">
          <Database className="h-8 w-8 opacity-20" />
          Brak kopii zapasowych. Pierwsza kopia pojawi się po jej utworzeniu.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white"
            >
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{row.fileName}</span>
                <button
                  type="button"
                  disabled={Boolean(job?.active)}
                  onClick={() => setOpenId(openId === row.id ? null : row.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[13px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Przywróć
                </button>
              </div>
              {openId === row.id && (
                <RestoreForm
                  serviceId={serviceId}
                  backupId={row.id}
                  fileName={row.fileName}
                  onClose={() => setOpenId(null)}
                  onStarted={(j) => {
                    setJob(j);
                    setOpenId(null);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RestoreStatusBanner({ job }: { job: HostingRestoreJobDto }) {
  const failed = job.status === 'FAILED';
  const done = job.status === 'COMPLETED';
  const tone = failed
    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
    : done
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${tone}`}>
      {job.active ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : done ? (
        <Check className="h-4 w-4" />
      ) : (
        <AlertTriangle className="h-4 w-4" />
      )}
      <span>
        Przywracanie: <strong>{STATUS_LABEL[job.status]}</strong>
        {job.active ? ' — nie zamykaj usługi do zakończenia.' : ''}
        {failed && job.error ? ` — ${job.error}` : ''}
        {done ? ' — dane przywrócone z kopii.' : ''}
      </span>
    </div>
  );
}

function RestoreForm({
  serviceId,
  backupId,
  fileName,
  onClose,
  onStarted,
}: {
  serviceId: string;
  backupId: string;
  fileName: string;
  onClose: () => void;
  onStarted: (job: HostingRestoreJobDto) => void;
}) {
  const [files, setFiles] = useState(true);
  const [databases, setDatabases] = useState(true);
  const [email, setEmail] = useState(false);
  const [safety, setSafety] = useState(true);
  const [confirmDomain, setConfirmDomain] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = (files || databases || email) && confirmDomain.trim().length > 2 && !pending;

  async function submit() {
    setErr(null);
    setPending(true);
    try {
      const j = await enqueueHostingRestoreAction(serviceId, {
        backupId,
        scopeFiles: files,
        scopeDatabases: databases,
        scopeEmail: email,
        safetyBackup: safety,
        confirmDomain: confirmDomain.trim(),
      });
      onStarted(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Nie udało się zlecić przywracania.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[12.5px] text-amber-100/90">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Przywrócenie <strong className="font-mono">{fileName}</strong> nadpisze bieżące dane w
          wybranym zakresie. Zalecamy zostawić włączoną kopię bezpieczeństwa.
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-[13px]">
        <Toggle label="Pliki" checked={files} onChange={setFiles} />
        <Toggle label="Bazy danych" checked={databases} onChange={setDatabases} />
        <Toggle label="Poczta" checked={email} onChange={setEmail} />
        <Toggle label="Kopia bezpieczeństwa przed przywróceniem" checked={safety} onChange={setSafety} />
      </div>

      <label className="block">
        <span className="mb-1 block text-[12px] text-neutral-400">
          Aby potwierdzić, wpisz dokładną domenę tej usługi
        </span>
        <input
          value={confirmDomain}
          onChange={(e) => setConfirmDomain(e.target.value)}
          placeholder="np. twojadomena.pl"
          className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
        />
      </label>

      {err && (
        <p className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[13px] text-rose-200">
          <AlertTriangle className="h-4 w-4" /> {err}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Przywróć z tej kopii
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-neutral-300 hover:text-white"
        >
          <X className="h-4 w-4" /> Anuluj
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-neutral-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-emerald-500"
      />
      {label}
    </label>
  );
}
