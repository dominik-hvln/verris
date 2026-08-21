"use client";

import { useState, useTransition } from "react";
import {
  runStaffDiagnosticsAction,
  type DiagnosticFinding,
  type ServiceDiagnostics,
} from "./diagnostics-actions";

const STATUS_STYLE: Record<DiagnosticFinding["status"], string> = {
  ok: "border-emerald-500/30 bg-emerald-500/5",
  warn: "border-amber-500/30 bg-amber-500/5",
  critical: "border-rose-500/30 bg-rose-500/5",
};
const STATUS_DOT: Record<DiagnosticFinding["status"], string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  critical: "bg-rose-400",
};
const OVERALL_LABEL: Record<ServiceDiagnostics["overall"], string> = {
  ok: "Brak problemów",
  attention: "Wymaga uwagi",
  critical: "Pilne problemy",
};

/** ADM-2 (parytet staffa) — „Diagnozuj" w CRM staffa. */
export function StaffDiagnosticsPanel({ subscriptionId }: { subscriptionId: string }) {
  const [result, setResult] = useState<ServiceDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      const res = await runStaffDiagnosticsAction(subscriptionId);
      if (res.ok) setResult(res.data);
      else setError(res.error);
    });

  return (
    <section className="rounded-2xl border border-white/10 bg-black/35 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Diagnostyka usługi</h2>
          <p className="text-xs text-muted-foreground">
            Subskrypcja, konto DA, węzeł i checki DNS/SSL/poczty/backupu w jednym obrazie z sugerowaną akcją.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="shrink-0 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
        >
          {pending ? "Diagnozuję…" : "Diagnozuj"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${STATUS_STYLE[result.overall === "attention" ? "warn" : result.overall]}`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[result.overall === "attention" ? "warn" : result.overall]}`}
            />
            <span className="font-semibold text-white">{OVERALL_LABEL[result.overall]}</span>
            <span className="text-muted-foreground">— {result.summary}</span>
          </div>
          {result.findings.length > 0 ? (
            <div className="space-y-2">
              {result.findings.map((f, i) => (
                <div key={i} className={`rounded-lg border p-3 ${STATUS_STYLE[f.status]}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[f.status]}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {f.area}
                    </span>
                    <span className="text-sm font-semibold text-white">{f.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-300">{f.detail}</p>
                  {f.action ? (
                    <p className="mt-1 text-xs text-cyan-200">
                      <span className="font-semibold">Sugerowana akcja:</span> {f.action}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-200/90">Brak ustaleń — usługa wygląda poprawnie.</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Wygenerowano: {new Date(result.generatedAt).toLocaleString("pl-PL")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
