"use client";

import { useState, useTransition } from "react";
import { retryNodeTask } from "./actions";
import type { NodeTaskRow } from "./data";

const STATUS_TONE: Record<string, string> = {
  QUEUED: "text-sky-300",
  RUNNING: "text-amber-300",
  COMPLETED: "text-emerald-300",
  FAILED: "text-rose-300",
  CANCELLED: "text-neutral-500",
};

const KIND_LABEL: Record<string, string> = {
  HOSTING_PROFILE: "Profil hostingu",
  WP_INSTALL: "Instalacja WordPress",
  WAF_APPLY: "WAF (ModSecurity)",
  STAGING_SYNC: "Staging (klon/publikacja)",
  PHP_APPLY: "Zmiana wersji PHP",
  APP_INSTALL: "Instalacja aplikacji",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL");
}

export function NodeTasksSection({ rows }: { rows: NodeTaskRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-neutral-500">
        Brak operacji węzłów w historii.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wider text-neutral-400">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Operacja</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
            <th className="px-3 py-2 text-left font-semibold">Węzeł / konto</th>
            <th className="px-3 py-2 text-left font-semibold">Zlecił</th>
            <th className="px-3 py-2 text-left font-semibold">Utworzono</th>
            <th className="px-3 py-2 text-right font-semibold">Akcja</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2 text-neutral-200">{KIND_LABEL[t.kind] ?? t.kind}</td>
              <td className={`px-3 py-2 ${STATUS_TONE[t.status] ?? "text-neutral-300"}`}>
                {t.status}
                {t.errorMessage ? (
                  <p className="mt-0.5 max-w-[320px] truncate text-[11px] text-rose-400/80" title={t.errorMessage}>
                    {t.errorMessage}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-2 text-neutral-300">
                {t.serverName}
                {t.accountDomain ? <span className="text-neutral-500"> · {t.accountDomain}</span> : null}
              </td>
              <td className="px-3 py-2 text-neutral-400">{t.requestedByEmail ?? "system"}</td>
              <td className="px-3 py-2 text-neutral-400">{fmt(t.createdAt)}</td>
              <td className="px-3 py-2 text-right">
                {t.status === "FAILED" ? <RetryNodeTaskButton taskId={t.id} /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RetryNodeTaskButton({ taskId }: { taskId: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || done}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await retryNodeTask(taskId);
            if (res.ok) setDone(true);
            else setError(res.error);
          });
        }}
        className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
      >
        {done ? "Ponowiono" : pending ? "..." : "Ponów"}
      </button>
      {error && <span className="max-w-[200px] truncate text-[10px] text-red-400">{error}</span>}
    </div>
  );
}
