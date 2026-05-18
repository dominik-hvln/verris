"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { retryDataExportAction } from "./actions";
import type { AdminDataExportRow } from "./data";

const STATUS_LABEL: Record<AdminDataExportRow["status"], string> = {
  PENDING: "W kolejce",
  GENERATING: "Generowanie...",
  READY: "Gotowy",
  EXPIRED: "Wygasł",
  FAILED: "Błąd",
};

const STATUS_TONE: Record<AdminDataExportRow["status"], string> = {
  PENDING: "bg-neutral-500/10 text-neutral-300 border-neutral-500/30",
  GENERATING: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  READY: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  EXPIRED: "bg-neutral-500/10 text-neutral-500 border-neutral-500/30",
  FAILED: "bg-rose-500/10 text-rose-300 border-rose-500/30",
};

export function DataExportsTable({ rows }: { rows: AdminDataExportRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [_, startTransition] = useTransition();

  const onRetry = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      const res = await retryDataExportAction(id);
      setFeedback(res.ok ? `Zaplanowano retry ${id.slice(0, 8)}…` : res.error ?? "Błąd retry.");
      setPendingId(null);
    });
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <p className="text-xs text-muted-foreground">{feedback}</p>
      )}
      <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
        <table className="w-full text-left text-sm text-white">
          <thead className="bg-white/[0.04] border-b border-white/10 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Klient</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Zażądany</th>
              <th className="px-4 py-3 font-medium">Wygasa</th>
              <th className="px-4 py-3 font-medium">Rozmiar</th>
              <th className="px-4 py-3 font-medium text-right">Akcja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Brak eksportów.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-xs">{r.user?.email ?? r.userId}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_TONE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.errorMessage && (
                    <p className="text-[10px] text-rose-400 mt-1">{r.errorMessage}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(r.requestedAt).toLocaleString("pl-PL")}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.expiresAt ? new Date(r.expiresAt).toLocaleString("pl-PL") : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                  {r.sizeBytes ? `${(r.sizeBytes / 1024).toFixed(1)} KB` : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {(r.status === "FAILED" || r.status === "PENDING") && (
                    <button
                      onClick={() => onRetry(r.id)}
                      disabled={pendingId === r.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      {pendingId === r.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
