"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Play,
  RefreshCw,
  ServerCog,
  XCircle,
} from "lucide-react";
import type { AuditCheckStatus, NodeStackReadinessDto } from "@verris/contracts";
import { ensureNodeStack, fetchNodeStackReadiness } from "../actions";

const STATUS_LABEL: Record<AuditCheckStatus, string> = {
  OK: "Działa",
  WARN: "Uwaga",
  FAIL: "Brak / błąd",
  UNKNOWN: "Do weryfikacji na węźle",
};

const STATUS_CLASS: Record<AuditCheckStatus, string> = {
  OK: "text-emerald-200 bg-emerald-500/15 border-emerald-500/30",
  WARN: "text-amber-200 bg-amber-500/15 border-amber-500/30",
  FAIL: "text-rose-200 bg-rose-500/15 border-rose-500/30",
  UNKNOWN: "text-zinc-300 bg-zinc-500/15 border-zinc-500/30",
};

const STATUS_ICON: Record<AuditCheckStatus, typeof CheckCircle2> = {
  OK: CheckCircle2,
  WARN: AlertCircle,
  FAIL: XCircle,
  UNKNOWN: HelpCircle,
};

const OVERALL_CLASS: Record<AuditCheckStatus, string> = {
  OK: "border-emerald-500/40 bg-emerald-500/10",
  WARN: "border-amber-500/40 bg-amber-500/10",
  FAIL: "border-rose-500/40 bg-rose-500/10",
  UNKNOWN: "border-zinc-500/40 bg-zinc-500/10",
};

export function NodeStackReadinessPanel({
  serverId,
  serverStatus,
}: {
  serverId: string;
  serverStatus: string;
}) {
  const [report, setReport] = useState<NodeStackReadinessDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const result = await fetchNodeStackReadiness(serverId);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setReport(result.data);
      setError(null);
    }
  }, [serverId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEnsure = serverStatus === "ACTIVE" && (report?.ensureAvailable ?? false);
  const task = report?.hostingProfileTask;
  const taskInflight = task?.status === "QUEUED" || task?.status === "RUNNING";

  useEffect(() => {
    if (!taskInflight) return;
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [taskInflight, load]);

  const onEnsure = () => {
    setError(null);
    startTransition(async () => {
      const result = await ensureNodeStack(serverId, { skipBuild: true });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      await load();
    });
  };

  const overall = report?.status ?? "UNKNOWN";

  return (
    <section
      id="stack-readiness"
      className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4 scroll-mt-24"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ServerCog className="h-5 w-5 text-indigo-300" />
            Usługi hostingowe na węźle
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Podsumowanie wymaganych modułów (poczta, FTP, baza, WWW, DirectAdmin, CageFS) —
            sondy TCP/TLS z panelu sterowania oraz zgodność z dokumentacją DirectAdmin /
            CloudLinux. Przycisk poniżej uruchamia profil na węźle (Exim, Dovecot, FTP,
            Governor, MariaDB).
          </p>
        </div>
        {report && (
          <div
            className={`rounded-xl border px-4 py-2 text-sm font-medium ${OVERALL_CLASS[overall]}`}
          >
            Stan ogólny: {STATUS_LABEL[overall]}
          </div>
        )}
      </div>

      {serverStatus !== "ACTIVE" && serverStatus !== "MAINTENANCE" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Pełna diagnostyka i instalacja usług dostępne po akceptacji węzła (ACTIVE).
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEnsure}
          disabled={!canEnsure || isPending || taskInflight}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
        >
          {isPending || taskInflight ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Zainstaluj i uruchom usługi hostingowe
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Odśwież diagnostykę
        </button>
      </div>

      {report?.probeHost && (
        <p className="text-[11px] text-muted-foreground">
          Sondy wykonane względem hosta:{" "}
          <code className="text-zinc-300">{report.probeHost}</code>
          {" · "}
          {new Date(report.generatedAt).toLocaleString("pl-PL")}
        </p>
      )}

      {error && (
        <p className="text-sm text-rose-300 flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {task && (
        <p className="text-xs text-sky-200">
          Ostatni profil hostingowy: {task.status}
          {taskInflight ? " — trwa instalacja na węźle, odświeżanie co 5 s." : ""}
          {task.errorMessage ? ` — ${task.errorMessage}` : ""}
        </p>
      )}

      {isPending && !report && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie diagnostyki…
        </div>
      )}

      {report && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Usługa</th>
                <th className="px-3 py-2 font-medium w-28">Status</th>
                <th className="px-3 py-2 font-medium">Podsumowanie</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((check) => {
                const Icon = STATUS_ICON[check.status];
                const open = expandedId === check.id;
                return (
                  <tr key={check.id} className="border-b border-white/5 last:border-0 align-top">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId(open ? null : check.id)}
                        className="text-left hover:text-indigo-200 transition-colors"
                      >
                        <span className="font-medium text-white">{check.title}</span>
                        {check.required && (
                          <span className="ml-1.5 text-[10px] text-rose-300/90">wymagane</span>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${STATUS_CLASS[check.status]}`}
                      >
                        <Icon className="h-3 w-3" />
                        {STATUS_LABEL[check.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-400 text-xs">{check.summary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {report && expandedId && report.checks.find((c) => c.id === expandedId) && (
        <div className="rounded-xl border border-white/10 bg-black/60 p-4 space-y-3 text-xs">
              {(() => {
                const check = report.checks.find((c) => c.id === expandedId)!;
                return (
                  <>
                    <p className="text-zinc-300">{check.summary}</p>
                    {check.records.length > 0 && (
                      <ul className="space-y-1">
                        {check.records.map((r) => (
                          <li key={r.label} className="flex flex-wrap gap-2">
                            <span className="text-muted-foreground">{r.label}:</span>
                            <span className={r.ok === false ? "text-rose-300" : "text-zinc-200"}>
                              {r.actual ?? "—"}
                              {r.expected ? ` (oczek.: ${r.expected})` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {check.docAttestation.map((doc, i) => (
                      <div key={i} className="border border-white/5 rounded-lg p-2 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-indigo-300/80">
                          {doc.vendor}
                          {doc.verifiedAt ? ` · zweryfikowano ${doc.verifiedAt}` : ""}
                        </p>
                        <p className="text-zinc-400">{doc.statement}</p>
                        {doc.reference && (
                          <a
                            href={doc.reference}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:underline"
                          >
                            Dokumentacja
                          </a>
                        )}
                      </div>
                    ))}
                  </>
                );
              })()}
        </div>
      )}
    </section>
  );
}
