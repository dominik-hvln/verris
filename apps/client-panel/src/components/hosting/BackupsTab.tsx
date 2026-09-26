'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Download, Loader2, RotateCcw, ShieldAlert, Check, X, AlertTriangle, FolderOpen } from 'lucide-react';
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
import { SectionHead } from '@/components/panel/v2';
import { ArchiveBrowser } from '@/components/hosting/ArchiveBrowser';
import BackupScheduleCard from '@/components/hosting/BackupScheduleCard';
import { HostingOffsitePanel } from '@/components/hosting/hosting-offsite-panel';
import { Checkbox } from '@/components/panel/checkbox';

const STATUS_LABEL: Record<HostingRestoreJobDto['status'], string> = {
  QUEUED: 'W kolejce',
  RUNNING: 'W trakcie',
  SAFETY_BACKUP: 'Kopia bezpieczeństwa',
  RESTORING: 'Przywracanie',
  COMPLETED: 'Odtwarzanie zlecone',
  FAILED: 'Błąd',
};

export default function BackupsTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<HostingBackupRowDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [job, setJob] = useState<HostingRestoreJobDto | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [plikiId, setPlikiId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback i zgłasza fałszywy setState w efekcie.
  const loadStatus = useCallback(
    () =>
      fetchHostingRestoreStatusAction(serviceId)
        .catch(() => null)
        .then((j) => {
          setJob(j);
          return j;
        }),
    [serviceId],
  );

  const loadRows = useCallback(
    () =>
      fetchHostingBackupsAction(serviceId)
        .then((res) => {
          setRows(res.rows);
          setError(res.fetchError);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać kopii.'))
        .finally(() => setLoading(false)),
    [serviceId],
  );

  useEffect(() => {
    // `loading` startuje jako true; serviceId pochodzi z trasy, więc jego zmiana to nowy montaż.
    void loadRows();
    void loadStatus();
  }, [loadRows, loadStatus]);

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
      <SectionHead title="Kopie zapasowe" desc="Harmonogram, kopie na koncie i przywracanie jednym kliknięciem." />
      <HostingHelpHint
        help={{
          blurb:
            'Kopia zapasowa to Twoja siatka bezpieczeństwa. Dodatkowo robimy kopie poza serwerem. Przed dużymi zmianami zrób kopię, a w razie problemu przywróć ją jednym kliknięciem.',
          kbQuery: 'kopie zapasowe',
        }}
      />
      <BackupScheduleCard serviceId={serviceId} />
      <BackupNowButton serviceId={serviceId} />

      {job && (job.active || job.status === 'COMPLETED' || job.status === 'FAILED') && (
        <RestoreStatusBanner job={job} />
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : error ? (
        <p className="rounded-[10px] border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
          {hostingFetchErrorMessage(error)}
        </p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <Database className="h-8 w-8 opacity-20" />
          Brak kopii zapasowych. Pierwsza kopia pojawi się po jej utworzeniu.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-[7px] border border-line bg-raised px-3 py-2 text-sm text-foreground"
            >
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 break-words font-mono text-[13px]">{row.fileName}</span>
                <button
                  type="button"
                  disabled={Boolean(job?.active)}
                  onClick={() => setOpenId(openId === row.id ? null : row.id)}
                  className="inline-flex items-center gap-1.5 rounded-[7px] border border-data/28 bg-data-soft px-2.5 py-1 text-[13px] font-medium text-data-hi transition hover:bg-data-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Przywróć
                </button>
                <button
                  type="button"
                  onClick={() => setPlikiId(plikiId === row.id ? null : row.id)}
                  aria-expanded={plikiId === row.id}
                  className="inline-flex items-center gap-1.5 rounded-[7px] border border-line bg-raised px-2.5 py-1 text-[13px] font-medium text-[color:var(--verris-body)] transition hover:bg-raised"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Pliki
                </button>
                {/* H-13 — archiwum na komputer (strumień przez /api/services/[id]/files/download). */}
                <a
                  href={`/api/services/${serviceId}/files/download?path=${encodeURIComponent(
                    row.fileName.includes('/') ? `/${row.fileName.replace(/^\/+/, '')}` : `/backups/${row.fileName}`,
                  )}`}
                  // Bez atrybutu download: sukces przychodzi jako załącznik (plik się pobiera), a błąd
                  // (np. brak uprawnienia, limit) pokazuje się jako tekst zamiast pustego pliku.
                  className="inline-flex items-center gap-1.5 rounded-[7px] border border-line bg-raised px-2.5 py-1 text-[13px] font-medium text-[color:var(--verris-body)] transition hover:bg-raised"
                >
                  <Download className="h-3.5 w-3.5" /> Pobierz
                </a>
              </div>
              {plikiId === row.id ? <ArchiveBrowser serviceId={serviceId} archive={row.fileName} /> : null}
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

      {/* H-22 — kopie poza serwerem tam, gdzie klient ich szuka w kryzysie (wcześniej w „Zużyciu zasobów”). */}
      <section className="space-y-2">
        <SectionHead title="Kopie poza serwerem" desc="Gdy serwer ulegnie awarii, dane odtworzymy z kopii w drugim miejscu. Pobrana kopia trafia na listę powyżej." />
        <HostingOffsitePanel serviceId={serviceId} onFetched={() => void loadRows()} />
      </section>
    </div>
  );
}

function RestoreStatusBanner({ job }: { job: HostingRestoreJobDto }) {
  const failed = job.status === 'FAILED';
  const done = job.status === 'COMPLETED';
  const tone = failed
    ? 'border-crit/30 bg-crit/12 text-crit'
    : done
      ? 'border-data/28 bg-data-soft text-data-hi'
      : 'border-data/28 bg-data-soft text-data-hi';
  return (
    <div className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm ${tone}`}>
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
        {done ? ` — serwer odtwarza dane w tle, zwykle trwa to kilka minut.${job.safetyBackup ? ' Kopia sprzed odtworzenia jest na liście.' : ''}` : ''}
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
    <div className="mt-3 space-y-3 rounded-[7px] border border-line bg-background p-3">
      <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-2.5 py-2 text-[12.5px] text-warn">
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
        <span className="mb-1 block text-[12px] text-muted-foreground">
          Aby potwierdzić, wpisz dokładną domenę tej usługi
        </span>
        <input
          value={confirmDomain}
          onChange={(e) => setConfirmDomain(e.target.value)}
          placeholder="np. twojadomena.pl"
          className="w-full rounded-[7px] border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-data"
        />
      </label>

      {err && (
        <p className="flex items-center gap-2 rounded-md border border-crit/30 bg-crit/12 px-2.5 py-1.5 text-[13px] text-crit">
          <AlertTriangle className="h-4 w-4" /> {err}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-[7px] bg-primary text-primary-foreground font-semibold px-3 py-1.5 text-[13px] transition hover:bg-data-hi disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Przywróć z tej kopii
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-[7px] border border-line px-3 py-1.5 text-[13px] text-[color:var(--verris-body)] hover:text-foreground"
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
    <label className="inline-flex cursor-pointer items-center gap-2 text-[color:var(--verris-body)]">
      <Checkbox
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-emerald-500"
      />
      {label}
    </label>
  );
}
