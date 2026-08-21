"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertCircle, Loader2, RefreshCw, Shield } from "lucide-react";
import {
  fetchWafOverview,
  setAccountWafMode,
  type WafAccountRow,
  type WafMode,
} from "./waf-actions";

const MODE_LABEL: Record<WafMode, { label: string; cls: string }> = {
  ON: { label: "Blokowanie", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" },
  DETECTION: { label: "Detekcja", cls: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  OFF: { label: "Wyłączony", cls: "border-rose-500/30 bg-rose-500/10 text-rose-200" },
};

/** B2 — admin: ModSecurity per konto na węźle. */
export function WafPanel({ serverId }: { serverId: string }) {
  const [accounts, setAccounts] = useState<WafAccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await fetchWafOverview(serverId);
      if ("data" in res && res.data) {
        setAccounts(res.data.accounts);
        setError(null);
      } else if ("error" in res && res.error) {
        setError(res.error);
      }
      setLoaded(true);
    });
  }, [serverId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onSetMode = (accountId: string, mode: WafMode) => {
    setBusyId(accountId);
    startTransition(async () => {
      const res = await setAccountWafMode(serverId, accountId, mode);
      if ("error" in res && res.error) {
        setError(res.error);
      } else {
        setAccounts((prev) =>
          prev.map((a) => (a.id === accountId ? { ...a, wafMode: mode, wafAppliedAt: null } : a)),
        );
        setError(null);
      }
      setBusyId(null);
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-300" /> WAF (ModSecurity / OWASP CRS)
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Tryb per konto: <strong>Blokowanie</strong> (SecRuleEngine On), <strong>Detekcja</strong>{" "}
            (tylko log) lub <strong>Wyłączony</strong>. Zmiana stosowana przez agenta węzła do ~1 min.
            Serwerowa instalacja reguł: profil hostingowy (CustomBuild modsecurity + owasp).
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Odśwież
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {loaded && accounts.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">Brak kont hostingowych na tym węźle.</p>
      )}

      {accounts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-white/10">
                <th className="py-2 pr-4">Domena</th>
                <th className="py-2 pr-4">Konto DA</th>
                <th className="py-2 pr-4">Tryb WAF</th>
                <th className="py-2 pr-4">Zastosowano</th>
                <th className="py-2">Zmień</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-white/5 text-zinc-300">
                  <td className="py-2 pr-4 font-medium text-white">{a.domain}</td>
                  <td className="py-2 pr-4">
                    <code className="text-xs">{a.daUsername}</code>
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${MODE_LABEL[a.wafMode]?.cls ?? ""}`}
                    >
                      {MODE_LABEL[a.wafMode]?.label ?? a.wafMode}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {a.wafAppliedAt
                      ? new Date(a.wafAppliedAt).toLocaleString("pl-PL")
                      : "oczekuje na agenta…"}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1.5">
                      {(Object.keys(MODE_LABEL) as WafMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          disabled={busyId === a.id || a.wafMode === m}
                          onClick={() => onSetMode(a.id, m)}
                          className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 ${
                            a.wafMode === m
                              ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-200"
                              : "border-white/10 hover:bg-white/5"
                          }`}
                        >
                          {busyId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : MODE_LABEL[m].label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
