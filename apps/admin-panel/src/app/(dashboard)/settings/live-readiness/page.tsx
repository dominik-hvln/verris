import { CheckCircle2, AlertTriangle, XCircle, Rocket } from "lucide-react";
import { fetchLiveReadiness, type ReadinessCheck } from "./actions";

export const dynamic = "force-dynamic";

const ICON = {
  ok: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
  warn: <AlertTriangle className="h-5 w-5 text-amber-400" />,
  fail: <XCircle className="h-5 w-5 text-rose-400" />,
};

const ROW = {
  ok: "border-emerald-500/20 bg-emerald-500/5",
  warn: "border-amber-500/20 bg-amber-500/5",
  fail: "border-rose-500/25 bg-rose-500/10",
};

export default async function LiveReadinessPage() {
  const res = await fetchLiveReadiness();

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Gotowość do startu LIVE</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automatyczny przegląd krytycznych elementów przed uruchomieniem 100% produkcyjnym.
        </p>
      </header>

      {"error" in res || !res.data ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {"error" in res ? res.error : "Brak danych."}
        </div>
      ) : (
        <>
          <div
            className={`rounded-2xl border p-5 flex items-center gap-4 ${
              res.data.go ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"
            }`}
          >
            <Rocket className={`h-8 w-8 ${res.data.go ? "text-emerald-300" : "text-rose-300"}`} />
            <div>
              <p className="text-lg font-bold text-white">
                {res.data.go ? "GO — brak blokerów" : "NO-GO — są blokery do usunięcia"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {res.data.counts.ok} OK · {res.data.counts.warn} ostrzeżeń · {res.data.counts.fail} błędów ·
                wygenerowano {new Date(res.data.generatedAt).toLocaleString("pl-PL")}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {res.data.checks.map((c: ReadinessCheck) => (
              <div key={c.key} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${ROW[c.status]}`}>
                <div className="mt-0.5 shrink-0">{ICON[c.status]}</div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {c.label}
                    {!c.blocking && c.status !== "ok" ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-neutral-400">
                        nie-blokujące
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-neutral-300 mt-0.5">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
