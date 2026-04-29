import { ShieldAlert, AlertCircle, Download } from "lucide-react";
import { listIncidents } from "../actions";
import { IncidentsTable } from "./incidents-table";
import { IncidentsCsvExport } from "./csv-export";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function StatusIncidentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status = params.status === "RESOLVED" ? "RESOLVED" : params.status === "OPEN" ? "OPEN" : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const result = await listIncidents({ status, limit, offset });
  const data = result.ok ? result.data ?? { rows: [], total: 0 } : { rows: [], total: 0 };
  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md flex items-center gap-3">
            <ShieldAlert className="h-7 w-7 text-rose-400" />
            Historia incydentów
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Każdy incydent jest tworzony automatycznie przez engine po 2 kolejnych nieudanych
            probes i zamykany po pierwszym powrocie do sukcesu. Edytuj tytuł i komunikat publiczny
            (widoczny na <code className="text-xs">status.ekohost.pl</code>).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FilterChip current={status} value={undefined} label="Wszystkie" />
          <FilterChip current={status} value="OPEN" label="Otwarte" />
          <FilterChip current={status} value="RESOLVED" label="Rozwiązane" />
          <IncidentsCsvExport />
        </div>
      </header>

      {!result.ok && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" />
          <span>Nie udało się pobrać incydentów: {result.error}</span>
        </div>
      )}

      <IncidentsTable incidents={data.rows} />

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <PageNav status={status} page={page} totalPages={totalPages} />
        </div>
      )}
    </div>
  );
}

function FilterChip({
  current,
  value,
  label,
}: {
  current: string | undefined;
  value: "OPEN" | "RESOLVED" | undefined;
  label: string;
}) {
  const active = current === value;
  const params = new URLSearchParams();
  if (value) params.set("status", value);
  const href = `/status/incidents${params.toString() ? `?${params.toString()}` : ""}`;
  return (
    <a
      href={href}
      className={`text-xs px-3 py-1.5 rounded-lg border ${
        active
          ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-200 font-bold"
          : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
      }`}
    >
      {label}
    </a>
  );
}

function PageNav({
  status,
  page,
  totalPages,
}: {
  status: string | undefined;
  page: number;
  totalPages: number;
}) {
  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/status/incidents?${qs}` : "/status/incidents";
  };
  return (
    <>
      <a
        href={buildHref(page - 1)}
        aria-disabled={page <= 1}
        className={`text-xs px-3 py-1.5 rounded-lg border ${
          page <= 1
            ? "border-white/5 bg-white/[0.02] text-neutral-600 pointer-events-none"
            : "border-white/10 bg-white/5 text-white hover:bg-white/10"
        }`}
      >
        Poprzednia
      </a>
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      <a
        href={buildHref(page + 1)}
        aria-disabled={page >= totalPages}
        className={`text-xs px-3 py-1.5 rounded-lg border ${
          page >= totalPages
            ? "border-white/5 bg-white/[0.02] text-neutral-600 pointer-events-none"
            : "border-white/10 bg-white/5 text-white hover:bg-white/10"
        }`}
      >
        Następna
      </a>
    </>
  );
}
