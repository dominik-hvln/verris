import Link from "next/link";
import { adminApi } from "@/lib/api";

export const dynamic = "force-dynamic";

interface MigrationRow {
  id: string;
  subscriptionId: string;
  status: string;
  currentStep: string | null;
  targetDomain: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  userEmail: string | null;
  serviceTag: string | null;
  planName: string | null;
  jobs: { kind: string; status: string; attempts: number; maxAttempts: number }[];
}

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  RUNNING: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  QUEUED: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  DRAFT: "border-white/15 bg-white/5 text-muted-foreground",
  FAILED: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  CANCELED: "border-white/15 bg-white/5 text-muted-foreground",
};

const FILTERS = ["", "QUEUED", "RUNNING", "FAILED", "COMPLETED"] as const;

export default async function MigrationsCockpitPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  let rows: MigrationRow[] = [];
  let error: string | null = null;
  try {
    const res = await adminApi<{ rows: MigrationRow[] }>(
      `/admin/migrations${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    );
    rows = res.rows;
  } catch {
    error = "Nie udało się pobrać listy migracji.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Cockpit migracji</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flota zleceń migracji zewnętrznych — status, krok i ostatni błąd. Zarządzanie pojedynczą
          migracją (retry/log) jest na stronie subskrypcji.
        </p>
      </div>

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
            {f || "Wszystkie"}
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
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Klient / usługa</th>
                <th className="px-4 py-3 text-left">Domena docelowa</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Krok / zadania</th>
                <th className="px-4 py-3 text-left">Aktualizacja</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.03] align-top">
                  <td className="px-4 py-3">
                    <p className="truncate text-white">{r.userEmail ?? "—"}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {r.serviceTag ?? r.subscriptionId.slice(0, 8)} · {r.planName ?? ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.targetDomain ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[r.status] ?? STATUS_STYLE.DRAFT}`}
                    >
                      {r.status}
                    </span>
                    {r.lastError ? (
                      <p className="mt-1 max-w-[16rem] truncate text-[11px] text-rose-300" title={r.lastError}>
                        {r.lastError}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <p>{r.currentStep ?? "—"}</p>
                    {r.jobs.length > 0 ? (
                      <p className="mt-1">
                        {r.jobs.map((j) => `${j.kind}:${j.status}(${j.attempts}/${j.maxAttempts})`).join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.updatedAt).toLocaleString("pl-PL")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/subscriptions/${r.subscriptionId}`}
                      className="text-xs text-indigo-400 hover:underline"
                    >
                      Otwórz usługę
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
