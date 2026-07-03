import Link from "next/link";
import { adminApi } from "@/lib/api";
import { MigrationRowActions } from "./migration-row-actions";

export const dynamic = "force-dynamic";

interface JobLite {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  sequence: number;
  lastError: string | null;
}

interface MigrationRow {
  id: string;
  subscriptionId: string;
  status: string;
  currentStep: string | null;
  targetDomain: string | null;
  sourcePanelType: string | null;
  needsAttention: boolean;
  attentionReason: string | null;
  attentionAt: string | null;
  cutoverMode: string | null;
  cutoverAt: string | null;
  ticketId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  userEmail: string | null;
  serviceTag: string | null;
  planName: string | null;
  jobs: JobLite[];
}

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  RUNNING: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  QUEUED: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  ATTENTION: "border-amber-500/40 bg-amber-500/15 text-amber-100",
  DRAFT: "border-white/15 bg-white/5 text-muted-foreground",
  FAILED: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  CANCELED: "border-white/15 bg-white/5 text-muted-foreground",
};

const FILTERS = ["", "ATTENTION", "QUEUED", "RUNNING", "FAILED", "COMPLETED"] as const;

export default async function MigrationsCockpitPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  let rows: MigrationRow[] = [];
  let attentionCount = 0;
  let error: string | null = null;
  try {
    const res = await adminApi<{ rows: MigrationRow[]; attentionCount: number }>(
      `/admin/migrations${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    );
    rows = res.rows;
    attentionCount = res.attentionCount;
  } catch {
    error = "Nie udało się pobrać listy migracji.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Cockpit migracji</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flota zleceń migracji. Migracje są automatyczne — te oznaczone „Pilne” zatrzymał
          automat i czekają na dokończenie przez zespół (wznów, ponów krok lub oznacz jako ukończone).
        </p>
      </div>

      {attentionCount > 0 ? (
        <Link
          href="/migrations?status=ATTENTION"
          className="block rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 hover:bg-amber-500/15"
        >
          🔴 {attentionCount} {attentionCount === 1 ? "migracja wymaga" : "migracji wymaga"} uwagi zespołu — kliknij, aby zobaczyć.
        </Link>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f || "all"}
            href={f ? `/migrations?status=${f}` : "/migrations"}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              (status ?? "") === f
                ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-100"
                : "border-white/10 bg-black/30 text-muted-foreground hover:border-white/20"
            }`}
          >
            {f === "ATTENTION" ? "Pilne" : f || "Wszystkie"}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/30 p-8 text-center text-sm text-muted-foreground">
          Brak migracji{status ? ` w statusie ${status}` : ""}.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border bg-black/30 p-4 ${
                r.needsAttention ? "border-amber-500/40" : "border-white/10"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[r.status] ?? STATUS_STYLE.DRAFT}`}
                    >
                      {r.status === "ATTENTION" ? "PILNE" : r.status}
                    </span>
                    <p className="truncate text-white">{r.targetDomain ?? "—"}</p>
                    {r.sourcePanelType && r.sourcePanelType !== "manual" ? (
                      <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {r.sourcePanelType}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {r.userEmail ?? "—"} · {r.serviceTag ?? r.subscriptionId.slice(0, 8)} · {r.planName ?? ""}
                  </p>
                  {r.needsAttention && r.attentionReason ? (
                    <p className="mt-1 max-w-2xl text-xs text-amber-200/90">{r.attentionReason}</p>
                  ) : r.lastError ? (
                    <p className="mt-1 max-w-2xl truncate text-xs text-rose-300" title={r.lastError}>
                      {r.lastError}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Krok: {r.currentStep ?? "—"} · aktualizacja {new Date(r.updatedAt).toLocaleString("pl-PL")}
                  </p>
                </div>
                <MigrationRowActions
                  migrationId={r.id}
                  subscriptionId={r.subscriptionId}
                  ticketId={r.ticketId}
                  needsAttention={r.needsAttention}
                  jobs={r.jobs}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
