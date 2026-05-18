"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Skull } from "lucide-react";
import { forceAnonymizeAction } from "./actions";
import type { AdminDeletionRow } from "./data";

export function DeletionRequestsTable({ rows }: { rows: AdminDeletionRow[] }) {
  const [target, setTarget] = useState<AdminDeletionRow | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    if (!target || reason.trim().length < 3) return;
    startTransition(async () => {
      const result = await forceAnonymizeAction(target.userId, reason.trim());
      if (result.ok) {
        setFeedback(`Konto ${target.user?.email ?? target.userId} zostało zanonimizowane.`);
        setTarget(null);
        setReason("");
      } else {
        setFeedback(result.error ?? "Błąd anonimizacji.");
      }
    });
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {feedback}
        </div>
      )}
      <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
        <table className="w-full text-left text-sm text-white">
          <thead className="bg-white/[0.04] border-b border-white/10 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Klient</th>
              <th className="px-4 py-3 font-medium">Zażądane</th>
              <th className="px-4 py-3 font-medium">Zaplanowane</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Anonimizator</th>
              <th className="px-4 py-3 font-medium text-right">Akcja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Brak wniosków o usunięcie.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const status = r.anonymizedAt
                ? "ANONIMIZOWANY"
                : r.cancelledAt
                  ? "ANULOWANY"
                  : new Date(r.scheduledFor) <= new Date()
                    ? "DO ANONIMIZACJI"
                    : "OCZEKUJE";
              return (
                <tr key={r.userId} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-xs">
                    {r.user?.email ?? r.userId}
                    {r.reason && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{r.reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.requestedAt).toLocaleString("pl-PL")}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.scheduledFor).toLocaleString("pl-PL")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.anonymizedByAdmin?.email ?? (r.anonymizedAt ? "auto (cron)" : "—")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!r.anonymizedAt && !r.cancelledAt && (
                      <button
                        onClick={() => setTarget(r)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                      >
                        <Skull className="h-3 w-3" />
                        Anonimizuj teraz
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {target && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-neutral-950 p-6 shadow-2xl">
            <header className="mb-4 flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-white">
                  Wymuś natychmiastową anonimizację
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Klient: <strong>{target.user?.email ?? target.userId}</strong>
                </p>
              </div>
            </header>
            <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              Operacja jest <strong>nieodwracalna</strong>. Konto zostanie zanonimizowane natychmiast,
              z pominięciem 14-dniowego okresu karencji. Użyj wyłącznie na pisemny wniosek UODO,
              osoby uprawnionej lub w przypadku istotnego naruszenia regulaminu wymagającego natychmiastowej akcji.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Powód (wymagany, min. 3 znaki)"
              className="mt-4 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setTarget(null);
                  setReason("");
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5"
              >
                Anuluj
              </button>
              <button
                onClick={onConfirm}
                disabled={pending || reason.trim().length < 3}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Skull className="h-3 w-3" />}
                Anonimizuj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, string> = {
    OCZEKUJE: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    "DO ANONIMIZACJI": "bg-orange-500/10 text-orange-300 border-orange-500/30",
    ANULOWANY: "bg-neutral-500/10 text-neutral-400 border-neutral-500/30",
    ANONIMIZOWANY: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
        tones[status] ?? ""
      }`}
    >
      {status}
    </span>
  );
}
