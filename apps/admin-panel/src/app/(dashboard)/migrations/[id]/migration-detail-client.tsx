"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getMigrationDetailAction,
  resolveMigrationAttentionAction,
  retryMigrationJobAction,
  revealMigrationSecretsAction,
} from "../actions";

interface SourceFormFtp {
  protocol: string;
  host: string;
  port: number;
  username: string;
  remotePath: string;
  hasPassword: boolean;
}
interface SourceFormDb {
  host: string;
  port: number;
  database: string;
  username: string;
  hasPassword: boolean;
}
interface SourceFormBox {
  host: string;
  port: number;
  email: string;
  username: string;
  hasPassword: boolean;
}
interface SourceForm {
  targetDomain: string | null;
  sourceDomain: string | null;
  notes: string | null;
  submittedAt: string | null;
  ftp: SourceFormFtp | null;
  mysql: SourceFormDb[];
  imap: SourceFormBox[];
}

interface DetailJob {
  id: string;
  kind: string;
  status: string;
  sequence: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  progress: { bytes: string; files: number; note: string | null; at: string } | null;
  integrity: Record<string, unknown> | null;
  lastHeartbeatAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  log: string | null;
  workerId: string | null;
}

export interface MigrationDetail {
  id: string;
  status: string;
  currentStep: string | null;
  targetDomain: string | null;
  sourcePanelType: string | null;
  needsAttention: boolean;
  attentionReason: string | null;
  cutoverMode: string | null;
  cutoverAt: string | null;
  bytesTransferred: string;
  filesTransferred: number;
  databasesMigrated: number;
  mailboxesMigrated: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  ticketId: string | null;
  clientEmail: string;
  clientName: string | null;
  clientUserId: string;
  planName: string | null;
  accountDomain: string | null;
  accountUsername: string | null;
  serverId: string | null;
  subscriptionId: string;
  secretsPurgedAt: string | null;
  sourceForm: SourceForm | null;
  jobs: DetailJob[];
}

const JOB_LABELS: Record<string, string> = {
  FILES_SFTP_RSYNC: "Pliki strony",
  FILES_DELTA: "Pliki — dosync",
  MYSQL_IMPORT: "Baza danych",
  WP_FIXUP: "Konfiguracja WordPress",
  IMAP_SYNC: "Poczta (skrzynki)",
  IMAP_DELTA: "Poczta — dosync",
  HTTP_POST_CHECK: "Test działania strony",
};

const ACTIVE = new Set(["QUEUED", "RUNNING"]);

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let u = 0;
  while (size >= 1024 && u < units.length - 1) {
    size /= 1024;
    u += 1;
  }
  return `${size < 10 && u > 0 ? size.toFixed(1) : Math.round(size)} ${units[u]}`;
}

export function MigrationDetailClient({ initial }: { initial: MigrationDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState<MigrationDetail>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await getMigrationDetailAction({ migrationId: initial.id });
    if ("ok" in res) setDetail(res.detail as MigrationDetail);
  }, [initial.id]);

  useEffect(() => {
    if (!ACTIVE.has(detail.status)) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh, detail.status]);

  function act(fn: () => Promise<{ ok: true } | { error: string }>, okText: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) setMsg({ type: "err", text: res.error });
      else {
        setMsg({ type: "ok", text: okText });
        await refresh();
        router.refresh();
      }
    });
  }

  const jobs = detail.jobs;
  const done = jobs.filter((j) => j.status === "COMPLETED").length;
  const pct = jobs.length > 0 ? Math.round((done / jobs.length) * 100) : detail.status === "COMPLETED" ? 100 : 0;

  return (
    <div className="space-y-6">
      {/* Nagłówek: dane klienta + wprowadzone dane z formularza */}
      <ClientHeader detail={detail} />

      {/* Pasek postępu + statystyki */}
      <section className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <StatusBadge status={detail.status} />
          <span className="text-xs text-muted-foreground">
            {done}/{jobs.length} kroków · aktualizacja {new Date(detail.updatedAt).toLocaleString("pl-PL")}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${detail.status === "FAILED" || detail.status === "ATTENTION" ? "bg-amber-500" : "bg-sky-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="Pliki" value={`${detail.filesTransferred} · ${formatBytes(detail.bytesTransferred)}`} />
          <Stat label="Bazy" value={String(detail.databasesMigrated)} />
          <Stat label="Skrzynki" value={String(detail.mailboxesMigrated)} />
        </div>
      </section>

      {/* Eskalacja + akcje */}
      {detail.needsAttention ? (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-100">🔴 Migracja wymaga dokończenia przez zespół</p>
          {detail.attentionReason ? <p className="text-xs text-amber-200/90">{detail.attentionReason}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => resolveMigrationAttentionAction({ migrationId: detail.id, outcome: "requeue" }), "Automat wznowiony.")}
              className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
            >
              Wznów automat
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => resolveMigrationAttentionAction({ migrationId: detail.id, outcome: "completed" }), "Oznaczono jako ukończone.")}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              Oznacz ukończone
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => resolveMigrationAttentionAction({ migrationId: detail.id, outcome: "failed" }), "Oznaczono jako nieudane.")}
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
            >
              Oznacz nieudane
            </button>
          </div>
        </section>
      ) : null}

      {/* Sekrety źródła (audytowane) */}
      {detail.secretsPurgedAt ? (
        <section className="rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-muted-foreground">
          Dane dostępowe usunięte zgodnie z retencją {new Date(detail.secretsPurgedAt).toLocaleString("pl-PL")}.
          Hasła źródła nie są już przechowywane.
        </section>
      ) : (
        <RevealSecrets migrationId={detail.id} />
      )}

      {/* Kroki — każdy osobno, z logiem i retry */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Kroki migracji</h2>
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} disabled={pending} onRetry={() => act(() => retryMigrationJobAction({ migrationId: detail.id, jobId: job.id }), "Krok ponowiony.")} />
        ))}
        {jobs.length === 0 ? <p className="text-xs text-muted-foreground">Brak kroków.</p> : null}
      </section>

      {msg ? (
        <p className={`text-sm ${msg.type === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>
      ) : null}
    </div>
  );
}

function ClientHeader({ detail }: { detail: MigrationDetail }) {
  const form = detail.sourceForm;
  return (
    <section className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 text-sm">
        <Field label="Klient" value={detail.clientName ?? detail.clientEmail} />
        <Field label="E-mail" value={detail.clientEmail} />
        <Field label="Usługa / plan" value={`${detail.accountUsername ?? detail.subscriptionId.slice(0, 8)} · ${detail.planName ?? "—"}`} />
        <Field label="Konto docelowe" value={detail.accountDomain ?? "—"} />
        <Field label="Domena docelowa" value={detail.targetDomain ?? form?.targetDomain ?? "—"} />
        <Field label="Domena źródłowa" value={form?.sourceDomain ?? "—"} />
        <Field label="Panel źródłowy" value={detail.sourcePanelType ?? "—"} />
        <Field label="Węzeł (serverId)" value={detail.serverId ?? "—"} />
      </div>

      {form ? (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Dane wprowadzone przez klienta (bez haseł)</p>

          {form.ftp ? (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              <p className="mb-1 font-semibold text-white">Pliki ({form.ftp.protocol.toUpperCase()})</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4 text-muted-foreground">
                <KV k="Host" v={form.ftp.host} />
                <KV k="Port" v={String(form.ftp.port)} />
                <KV k="Użytkownik" v={form.ftp.username} />
                <KV k="Ścieżka" v={form.ftp.remotePath} />
                <KV k="Hasło" v={form.ftp.hasPassword ? "✓ podane" : "— brak"} />
              </dl>
            </div>
          ) : null}

          {form.mysql.length > 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              <p className="mb-1 font-semibold text-white">Bazy danych ({form.mysql.length})</p>
              <div className="space-y-1">
                {form.mysql.map((db, i) => (
                  <p key={i} className="font-mono text-muted-foreground">
                    {db.username}@{db.host}:{db.port}/{db.database} {db.hasPassword ? "· 🔒" : "· ⚠ bez hasła"}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {form.imap.length > 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              <p className="mb-1 font-semibold text-white">Skrzynki e-mail ({form.imap.length})</p>
              <div className="space-y-1">
                {form.imap.map((box, i) => (
                  <p key={i} className="font-mono text-muted-foreground">
                    {box.email} ({box.username}@{box.host}:{box.port}) {box.hasPassword ? "· 🔒" : "· ⚠ bez hasła"}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {form.notes ? (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              <p className="mb-1 font-semibold text-white">Notatki klienta</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{form.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-white/10 pt-3 text-xs">
        <Link href={`/subscriptions/${detail.subscriptionId}`} className="text-indigo-400 hover:underline">
          Otwórz usługę
        </Link>
        {detail.ticketId ? (
          <Link href={`/tickets/${detail.ticketId}`} className="text-indigo-400 hover:underline">
            Powiązany ticket
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function RevealSecrets({ migrationId }: { migrationId: string }) {
  const [reason, setReason] = useState("");
  const [bundle, setBundle] = useState<unknown>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 space-y-2">
      <p className="text-sm font-semibold text-white">Dane dostępowe (hasła)</p>
      <p className="text-xs text-muted-foreground">
        Odsłonięcie jest zapisywane w audycie. Podaj powód (min. 10 znaków) — np. numer ticketu.
      </p>
      {bundle ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-black/60 p-3 text-[11px] text-emerald-200">
          {JSON.stringify(bundle, null, 2)}
        </pre>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Powód odsłonięcia (min. 10 znaków)"
            className="min-w-[16rem] flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white"
          />
          <button
            type="button"
            disabled={pending || reason.trim().length < 10}
            onClick={() =>
              startTransition(async () => {
                setErr(null);
                const res = await revealMigrationSecretsAction({ migrationId, reason: reason.trim() });
                if ("error" in res) setErr(res.error);
                else setBundle(res.bundle);
              })
            }
            className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
          >
            {pending ? "Odsłaniam…" : "Odsłoń dane dostępowe"}
          </button>
        </div>
      )}
      {err ? <p className="text-xs text-rose-300">{err}</p> : null}
    </section>
  );
}

function JobCard({ job, disabled, onRetry }: { job: DetailJob; disabled: boolean; onRetry: () => void }) {
  const [showLog, setShowLog] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">#{job.sequence}</span>
          <span className="text-sm text-white">{JOB_LABELS[job.kind] ?? job.kind}</span>
          <JobStatus status={job.status} />
          <span className="text-[11px] text-muted-foreground">({job.attempts}/{job.maxAttempts})</span>
        </div>
        <div className="flex gap-2">
          {job.log ? (
            <button type="button" onClick={() => setShowLog((s) => !s)} className="rounded border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-white/20">
              {showLog ? "Ukryj log" : "Log"}
            </button>
          ) : null}
          {job.status === "FAILED" ? (
            <button type="button" disabled={disabled} onClick={onRetry} className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-500/20 disabled:opacity-50">
              Ponów krok
            </button>
          ) : null}
        </div>
      </div>

      {job.status === "RUNNING" && job.progress ? (
        <p className="mt-1 text-[11px] text-sky-300">
          {job.progress.note ?? "w toku"}
          {Number(job.progress.bytes) > 0 ? ` — ${formatBytes(job.progress.bytes)}` : ""}
          {job.lastHeartbeatAt ? ` · sygnał ${new Date(job.lastHeartbeatAt).toLocaleTimeString("pl-PL")}` : ""}
        </p>
      ) : null}
      {job.integrity ? <IntegrityBadge integrity={job.integrity} /> : null}
      {job.lastError ? <p className="mt-1 text-[11px] text-rose-300/90">{job.lastError}</p> : null}
      {job.workerId ? <p className="mt-0.5 text-[10px] text-muted-foreground">worker: {job.workerId}</p> : null}

      {showLog && job.log ? (
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-black/60 p-2 text-[10px] text-neutral-400">
          {job.log.slice(-8000)}
        </pre>
      ) : null}
    </div>
  );
}

function IntegrityBadge({ integrity }: { integrity: Record<string, unknown> }) {
  const kind = integrity.kind as string;
  let text = "";
  let ok: boolean | null = (integrity.match as boolean | null) ?? null;
  if (kind === "files") {
    const s = integrity.sourceFiles as number | null;
    const t = integrity.targetFiles as number;
    text = s != null ? `pliki: ${t}/${s}` : `pliki: ${t}`;
  } else if (kind === "mysql") {
    const s = integrity.sourceRows as number | null;
    const t = integrity.targetRows as number;
    const tab = integrity.targetTables as number;
    text = s != null ? `wiersze: ${t}/${s} · tabele: ${tab}` : `wiersze: ${t} · tabele: ${tab}`;
  } else if (kind === "imap") {
    const s = integrity.sourceMessages as number | null;
    const t = (integrity.targetMessages as number | null) ?? 0;
    text = s != null ? `wiadomości: ${t}/${s}` : `wiadomości: ${t}`;
  } else {
    return null;
  }
  const color = ok === false ? "text-amber-300" : "text-emerald-300";
  const icon = ok === false ? "⚠" : ok === true ? "✓" : "·";
  return <p className={`mt-1 text-[11px] ${color}`}>{icon} spójność — {text}</p>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-white" title={value}>{value}</dd>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase">{k}</dt>
      <dd className="font-mono text-neutral-200">{v}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-white">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    RUNNING: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    QUEUED: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
    ATTENTION: "border-amber-500/40 bg-amber-500/15 text-amber-100",
    FAILED: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    CANCELED: "border-white/15 bg-white/5 text-muted-foreground",
    DRAFT: "border-white/15 bg-white/5 text-muted-foreground",
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] ?? map.DRAFT}`}>
      {status === "ATTENTION" ? "PILNE" : status}
    </span>
  );
}

function JobStatus({ status }: { status: string }) {
  const color =
    status === "COMPLETED" ? "text-emerald-300"
      : status === "RUNNING" ? "text-sky-300"
        : status === "FAILED" ? "text-rose-300"
          : status === "RETRYING" ? "text-amber-300"
            : "text-muted-foreground";
  return <span className={`text-xs font-medium ${color}`}>{status}</span>;
}
