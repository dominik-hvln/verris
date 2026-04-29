import { ShieldAlert } from "lucide-react";
import { listAuditLogs } from "./data";
import { AuditFiltersBar } from "./filters-bar";
import { AuditTable } from "./table";
import { ExportCsvButton } from "./export-button";

export const dynamic = "force-dynamic";

interface SearchParams {
  action?: string;
  userId?: string;
  actorUserId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: string;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const limit = 50;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * limit;

  const filters = {
    action: sp.action,
    userId: sp.userId,
    actorUserId: sp.actorUserId,
    search: sp.search,
    from: sp.from,
    to: sp.to,
    limit,
    offset,
  };

  const result = await listAuditLogs(filters);
  const data = result.ok ? result.data : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md flex items-center gap-3">
            <ShieldAlert className="h-7 w-7 text-rose-400" />
            Logi Bezpieczeństwa
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Pełna historia zdarzeń auditowanych: utworzenia/zmiany kont, akcji
            administracyjnych, zmian planu, suspendów, autoskalowania, prób uwierzytelnienia.
            Każda zmiana zachowuje aktora (kto), cel (kogo dotyczy) i kontekst (IP, UA).
          </p>
        </div>
        <ExportCsvButton filters={filters} />
      </header>

      <AuditFiltersBar
        defaults={{
          action: sp.action ?? "",
          userId: sp.userId ?? "",
          actorUserId: sp.actorUserId ?? "",
          search: sp.search ?? "",
          from: sp.from ?? "",
          to: sp.to ?? "",
        }}
      />

      {!result.ok ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Nie udało się pobrać logów: {result.error}
        </div>
      ) : (
        <AuditTable
          rows={data!.rows}
          page={page}
          totalPages={totalPages}
          totalRows={data!.total}
          limit={limit}
        />
      )}
    </div>
  );
}
