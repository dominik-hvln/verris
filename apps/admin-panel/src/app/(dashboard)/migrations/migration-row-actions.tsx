'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getMigrationDetailAction,
  resolveMigrationAttentionAction,
  retryMigrationJobAction,
} from './actions';

interface JobLite {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  sequence: number;
  lastError: string | null;
}

interface Props {
  migrationId: string;
  subscriptionId: string;
  ticketId: string | null;
  needsAttention: boolean;
  jobs: JobLite[];
}

interface DetailJob extends JobLite {
  log: string | null;
  workerId: string | null;
}

export function MigrationRowActions({ migrationId, subscriptionId, ticketId, needsAttention, jobs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [detailJobs, setDetailJobs] = useState<DetailJob[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if ('error' in res) setMsg(res.error);
      else router.refresh();
    });
  }

  async function toggleDetail() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const res = await getMigrationDetailAction({ migrationId });
    if ('ok' in res) {
      const d = res.detail as { jobs: DetailJob[] };
      setDetailJobs(d.jobs);
    } else {
      setMsg(res.error);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {needsAttention ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => resolveMigrationAttentionAction({ migrationId, outcome: 'requeue' }))}
              className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
            >
              Wznów automat
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => resolveMigrationAttentionAction({ migrationId, outcome: 'completed' }))}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              Oznacz ukończone
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={toggleDetail}
          className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-muted-foreground hover:border-white/20"
        >
          {open ? 'Ukryj kroki' : 'Kroki / logi'}
        </button>
        <Link
          href={`/migrations/${migrationId}`}
          className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200 hover:bg-indigo-500/20"
        >
          Szczegóły
        </Link>
        {ticketId ? (
          <Link href={`/tickets/${ticketId}`} className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200 hover:bg-indigo-500/20">
            Ticket
          </Link>
        ) : null}
        <Link href={`/subscriptions/${subscriptionId}`} className="text-xs text-indigo-400 hover:underline">
          Otwórz usługę
        </Link>
      </div>

      {msg ? <p className="text-right text-xs text-rose-300">{msg}</p> : null}

      {open ? (
        <div className="rounded-lg border border-white/10 bg-black/40 p-3">
          <ul className="space-y-2">
            {(detailJobs ?? jobs).map((job) => (
              <li key={job.id} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-neutral-200">
                    #{job.sequence} {job.kind} · <span className={jobColor(job.status)}>{job.status}</span> ({job.attempts}/{job.maxAttempts})
                  </span>
                  {job.status === 'FAILED' ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => retryMigrationJobAction({ migrationId, jobId: job.id }))}
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      Ponów krok
                    </button>
                  ) : null}
                </div>
                {job.lastError ? <p className="mt-0.5 text-rose-300/80">{job.lastError}</p> : null}
                {'log' in job && (job as DetailJob).log ? (
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/60 p-2 text-[10px] text-neutral-400">
                    {(job as DetailJob).log?.slice(-4000)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function jobColor(status: string): string {
  if (status === 'COMPLETED') return 'text-emerald-300';
  if (status === 'RUNNING') return 'text-sky-300';
  if (status === 'FAILED') return 'text-rose-300';
  if (status === 'RETRYING') return 'text-amber-300';
  return 'text-muted-foreground';
}
