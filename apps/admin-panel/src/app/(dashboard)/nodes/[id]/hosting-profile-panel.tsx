"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Loader2,
  Play,
  Terminal,
  Check,
  AlertCircle,
  Copy,
  RefreshCw,
} from "lucide-react";
import type { NodeTaskDto } from "@verris/contracts";
import {
  fetchHostingProfileTasks,
  fetchTasksAgentInstallScript,
  queueHostingProfile,
} from "../actions";

const STATUS_LABEL: Record<string, string> = {
  QUEUED: "W kolejce",
  RUNNING: "W trakcie",
  COMPLETED: "Zakończono",
  FAILED: "Błąd",
  CANCELLED: "Anulowano",
};

const STATUS_CLASS: Record<string, string> = {
  QUEUED: "text-amber-200 bg-amber-500/15 border-amber-500/30",
  RUNNING: "text-sky-200 bg-sky-500/15 border-sky-500/30",
  COMPLETED: "text-emerald-200 bg-emerald-500/15 border-emerald-500/30",
  FAILED: "text-rose-200 bg-rose-500/15 border-rose-500/30",
  CANCELLED: "text-zinc-300 bg-zinc-500/15 border-zinc-500/30",
};

export function HostingProfilePanel({
  serverId,
  serverStatus,
  compact = false,
}: {
  serverId: string;
  serverStatus: string;
  compact?: boolean;
}) {
  const [tasks, setTasks] = useState<NodeTaskDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [skipBuild, setSkipBuild] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [agentScript, setAgentScript] = useState<string | null>(null);
  const [agentCopied, setAgentCopied] = useState(false);

  const loadTasks = useCallback(async () => {
    const result = await fetchHostingProfileTasks(serverId);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if (result.data) setTasks(result.data);
  }, [serverId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const inflight = tasks.some((t) => t.status === "QUEUED" || t.status === "RUNNING");
    if (!inflight) return;
    const id = window.setInterval(() => void loadTasks(), 5000);
    return () => window.clearInterval(id);
  }, [tasks, loadTasks]);

  const latest = tasks[0] ?? null;
  const canRun = serverStatus === "ACTIVE";
  const queuedStuckMs =
    latest?.status === "QUEUED"
      ? Date.now() - new Date(latest.createdAt).getTime()
      : 0;
  const queuedStuck = queuedStuckMs > 90_000;

  const loadAgentScript = useCallback(() => {
    startTransition(async () => {
      const result = await fetchTasksAgentInstallScript(serverId);
      if ("data" in result && result.data) {
        setAgentScript(result.data.script);
      } else if ("error" in result) {
        setError(result.error ?? "Nie udało się pobrać skryptu agenta");
      }
    });
  }, [serverId]);

  useEffect(() => {
    if (queuedStuck && !agentScript && !isPending) {
      loadAgentScript();
    }
  }, [queuedStuck, agentScript, isPending, loadAgentScript]);

  const onRun = () => {
    setError(null);
    startTransition(async () => {
      const result = await queueHostingProfile(serverId, { skipBuild, dryRun });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      await loadTasks();
    });
  };

  const copyAgentScript = () => {
    if (!agentScript) return;
    void navigator.clipboard.writeText(agentScript).then(() => {
      setAgentCopied(true);
      setTimeout(() => setAgentCopied(false), 2000);
    });
  };

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md space-y-4 ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div>
        <h2 className={`font-semibold flex items-center gap-2 ${compact ? "text-base" : "text-lg"}`}>
          <Terminal className="h-4 w-4 text-indigo-300" /> Profil hostingowy
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Idempotentna konfiguracja floty: MySQL Governor (governor-mysql + dbctl), CustomBuild
          (LiteSpeed/LSPHP), restart LS. Domyślnie bez długiego CustomBuild rebuild.
        </p>
      </div>

      {!canRun && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Profil z panelu dostępny po akceptacji węzła (status ACTIVE).
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={skipBuild}
            onChange={(e) => setSkipBuild(e.target.checked)}
            className="rounded border-white/20"
          />
          Pomiń CustomBuild rebuild (zalecane)
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="rounded border-white/20"
          />
          Tylko dry-run
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun || isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 px-4 py-2 text-sm font-medium"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Uruchom profil na węźle
        </button>
        <button
          type="button"
          onClick={() => void loadTasks()}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Odśwież status
        </button>
      </div>

      {error && (
        <p className="text-sm text-rose-300 flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {latest && (
        <div className="rounded-xl border border-white/10 bg-black/50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Ostatnie zadanie · {new Date(latest.createdAt).toLocaleString("pl-PL")}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded border ${STATUS_CLASS[latest.status] ?? STATUS_CLASS.CANCELLED}`}
            >
              {STATUS_LABEL[latest.status] ?? latest.status}
            </span>
          </div>
          {(latest.status === "QUEUED" || latest.status === "RUNNING") && (
            <p className="text-xs text-sky-200">
              {latest.status === "RUNNING"
                ? "Profil wykonywany na węźle — może potrwać kilka minut (Governor, CustomBuild)."
                : queuedStuck
                  ? "Zadanie czeka >90 s — na węźle brakuje agenta zadań. Zainstaluj skrypt poniżej (SSH)."
                  : "Agent odbierze zadanie w ciągu ~1 minuty. Odświeżanie co 5 s."}
            </p>
          )}
          {latest.errorMessage && (
            <pre className="text-xs text-rose-200 whitespace-pre-wrap">{latest.errorMessage}</pre>
          )}
          {latest.outputLog && (
            <pre className="text-[11px] text-zinc-400 max-h-48 overflow-auto whitespace-pre-wrap border-t border-white/5 pt-2">
              {latest.outputLog}
            </pre>
          )}
        </div>
      )}

      <div className="border-t border-white/10 pt-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          {queuedStuck
            ? "Wymagana jednorazowa instalacja agenta zadań na węźle (bootstrapy sprzed agent-2):"
            : "Węzeł sprzed agent-2? Jednorazowa instalacja agenta zadań na SSH:"}
        </p>
        {!agentScript ? (
          <button
            type="button"
            onClick={loadAgentScript}
            disabled={isPending}
            className={`text-xs hover:underline ${queuedStuck ? "text-amber-300 font-medium" : "text-indigo-300"}`}
          >
            {queuedStuck ? "Pokaż skrypt instalacji (wymagane)" : "Pokaż skrypt instalacji agenta zadań"}
          </button>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <div className="flex justify-between items-center px-2 py-1 border-b border-white/10">
              <span className="text-[10px] text-muted-foreground">bash /root/install-verris-tasks.sh</span>
              <button type="button" onClick={copyAgentScript} className="text-xs px-2 py-1 hover:bg-white/5 rounded">
                {agentCopied ? <Check className="h-3 w-3 inline text-emerald-400" /> : <Copy className="h-3 w-3 inline" />}
              </button>
            </div>
            <pre className="p-2 text-[10px] max-h-32 overflow-auto text-zinc-400">{agentScript}</pre>
          </div>
        )}
      </div>
    </section>
  );
}
