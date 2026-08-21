"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Database, Loader2, AlertTriangle, Check, RefreshCw, ShieldAlert } from "lucide-react";
import type { NodeTaskDto } from "@verris/contracts";
import { queueDbUpgrade, fetchDbUpgradeTasks } from "../actions";

/** VER-UPG — dozwolone docelowe wersje MariaDB (muszą zgadzać się z API ALLOWED_DB_VERSIONS). */
const DB_VERSIONS: { value: string; label: string; eol: string }[] = [
  { value: "11.4", label: "MariaDB 11.4 LTS", eol: "wsparcie do 2029 — najszerzej ograne z DA/CloudLinux (zalecane)" },
  { value: "11.8", label: "MariaDB 11.8 LTS", eol: "wsparcie do czerwca 2028" },
  { value: "12.3", label: "MariaDB 12.3 LTS", eol: "najnowsze LTS — wsparcie do czerwca 2029" },
];

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

function majorMinor(v?: string | null): string | null {
  if (!v) return null;
  return (v.match(/\d+\.\d+/) ?? [])[0] ?? null;
}

export function DbUpgradePanel({
  serverId,
  dbEngine,
  dbVersion,
  targetDbVersion,
  dbUpgradeRequestedAt,
}: {
  serverId: string;
  dbEngine?: string | null;
  dbVersion?: string | null;
  targetDbVersion?: string | null;
  dbUpgradeRequestedAt?: string | null;
}) {
  const [version, setVersion] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [tasks, setTasks] = useState<NodeTaskDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = majorMinor(dbVersion);
  const active = tasks.find((t) => t.status === "QUEUED" || t.status === "RUNNING");

  const refresh = useCallback(async () => {
    const res = await fetchDbUpgradeTasks(serverId);
    if (res.data) setTasks(res.data);
  }, [serverId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-odświeżanie kiedy zlecenie jest w toku (upgrade trwa długo).
  useEffect(() => {
    if (active && !pollRef.current) {
      pollRef.current = setInterval(() => void refresh(), 15_000);
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
  }, [active, refresh]);

  const canSubmit = version !== "" && confirmText.trim().toUpperCase() === "UPGRADE" && !active && !pending;

  function submit() {
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const res = await queueDbUpgrade(serverId, version);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOkMsg(`Zlecono upgrade do MariaDB ${version}. Agent wykona pełny backup baz, a potem CustomBuild — to potrwa. Postęp pojawi się poniżej.`);
      setConfirmText("");
      setVersion("");
      await refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Database className="h-4 w-4 text-indigo-300" /> Silnik bazy danych (MariaDB)
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          Obecnie:{" "}
          <strong className="text-white">
            {dbEngine ?? "MariaDB"} {dbVersion ?? "—"}
          </strong>
        </span>
        {targetDbVersion && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/15 px-2.5 py-0.5 text-xs text-sky-200">
            <Loader2 className="h-3 w-3 animate-spin" /> Upgrade w toku → {targetDbVersion}
            {dbUpgradeRequestedAt ? ` (zlecono ${new Date(dbUpgradeRequestedAt).toLocaleString("pl-PL")})` : ""}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-[13px] text-amber-100/90 flex gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-amber-100">To operacja na żywym węźle — wykonaj w oknie serwisowym.</p>
          <p>
            Agent najpierw zrobi <strong>pełny zrzut wszystkich baz</strong> (mysqldump), a dopiero potem
            CustomBuild przebuduje silnik. W trakcie bazy klientów będą chwilowo niedostępne. MariaDB{" "}
            <strong>nie wspiera downgrade</strong> — wybór wersji niższej niż obecna zostanie odrzucony.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Wersja docelowa</span>
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={!!active || pending}
            className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 disabled:opacity-50"
          >
            <option value="">— wybierz wersję —</option>
            {DB_VERSIONS.map((v) => (
              <option key={v.value} value={v.value} disabled={current === v.value}>
                {v.label}
                {current === v.value ? " (już zainstalowana)" : ""}
              </option>
            ))}
          </select>
          {version && (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {DB_VERSIONS.find((v) => v.value === version)?.eol}
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Potwierdzenie — wpisz <code className="text-amber-200">UPGRADE</code>
          </span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={!!active || pending}
            placeholder="UPGRADE"
            className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 disabled:opacity-50"
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}
      {okMsg && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 flex items-center gap-2">
          <Check className="h-4 w-4" /> {okMsg}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/90 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Zleć upgrade DB
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-muted-foreground hover:text-white"
        >
          <RefreshCw className="h-4 w-4" /> Odśwież
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Historia zleceń</p>
          <ul className="space-y-2">
            {tasks.map((t) => {
              const target = (t.payload as { version?: string } | null)?.version ?? "?";
              return (
                <li key={t.id} className="rounded-lg border border-white/5 bg-black/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white">→ MariaDB {target}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        STATUS_CLASS[t.status] ?? "text-zinc-300 bg-zinc-500/15 border-zinc-500/30"
                      }`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString("pl-PL")}
                  </div>
                  {t.errorMessage && (
                    <p className="mt-1 text-[12px] text-rose-300">{t.errorMessage}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
