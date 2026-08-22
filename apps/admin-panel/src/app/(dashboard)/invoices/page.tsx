import Link from "next/link";
import { formatPlnAndCredits } from "@/lib/credits";
import { Search, FileDown, ExternalLink, FileText, Mail } from "lucide-react";
import {
  listAdminInvoices,
  type AdminInvoiceRow,
  type AdminInvoiceStatus,
} from "./data";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { value: AdminInvoiceStatus; label: string; tone: string }[] = [
  { value: "DRAFT", label: "Draft", tone: "bg-neutral-500/10 text-neutral-300 border-neutral-500/30" },
  { value: "OPEN", label: "Otwarta", tone: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  { value: "PAID", label: "Zapłacona", tone: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  { value: "VOID", label: "Anulowana", tone: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
  { value: "UNCOLLECTIBLE", label: "Nieściągalna", tone: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
];

interface PageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    userId?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

function statusTone(status: AdminInvoiceStatus): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.tone ?? "border-white/10 bg-white/5 text-white";
}

function statusLabel(status: AdminInvoiceStatus): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export default async function AdminInvoicesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search?.trim() || undefined;
  const userId = params.userId?.trim() || undefined;
  const statuses = params.status?.trim()
    ? (params.status.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) as AdminInvoiceStatus[])
    : undefined;
  const from = params.from || undefined;
  const to = params.to || undefined;
  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  let data: Awaited<ReturnType<typeof listAdminInvoices>> | null = null;
  let error: string | null = null;
  try {
    data = await listAdminInvoices({ search, userId, statuses, from, to, page, limit: 50 });
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }

  const csvHref = buildCsvHref({ search, userId, statuses, from, to });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
            Faktury (admin)
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Wszystkie faktury Verris (mirror Stripe + własne PDF VFV/...). Filtr
            po kliencie, statusie i zakresie dat. Dostęp: ADMIN i STAFF.
          </p>
          {/* Z-01 — droga wewnątrz systemu dla przypadków nietypowych. */}
          <Link
            href="/invoices/reczna"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-sm text-indigo-200 hover:bg-indigo-500/20"
          >
            <FileText className="h-4 w-4" />
            Wystaw fakturę ręcznie
          </Link>
        </div>
        {data ? (
          <a
            href={csvHref}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
          >
            <FileDown className="h-4 w-4" />
            Eksport CSV ({data.total.toLocaleString("pl-PL")})
          </a>
        ) : null}
      </header>

      <div className="relative rounded-2xl p-[1px] overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-indigo-500/20 to-transparent"></div>
        <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl flex flex-col shadow-2xl">
          <form
            action="/invoices"
            className="p-6 border-b border-white/10 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
          >
            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">
                Klient / numer / providerRef
              </label>
              <div className="relative flex items-center px-3 py-2 border border-white/10 rounded-lg bg-white/5">
                <Search className="h-4 w-4 text-muted-foreground mr-2" />
                <input
                  type="text"
                  name="search"
                  defaultValue={search ?? ""}
                  placeholder="email, imię, nazwa firmy, VFV/2026/05/…"
                  className="bg-transparent border-none outline-none text-sm text-white w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Status</label>
              <select
                name="status"
                defaultValue={statuses?.[0] ?? ""}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">— wszystkie —</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Od</label>
              <input
                type="date"
                name="from"
                defaultValue={from?.slice(0, 10) ?? ""}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Do</label>
              <input
                type="date"
                name="to"
                defaultValue={to?.slice(0, 10) ?? ""}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                className="rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/25"
              >
                Filtruj
              </button>
              <Link
                href="/invoices"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-center text-neutral-300 hover:bg-white/10"
              >
                Wyczyść
              </Link>
            </div>
            {userId ? (
              <div className="md:col-span-6 text-[11px] text-amber-300">
                Filtr klienta: <code className="font-mono">{userId}</code>{" "}
                <Link href="/invoices" className="underline">
                  (usuń)
                </Link>
              </div>
            ) : null}
          </form>

          {error ? (
            <div className="p-10 text-center text-sm text-rose-300">{error}</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Brak faktur dla tych kryteriów.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white">
                <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-medium">Numer</th>
                    <th className="px-6 py-4 font-medium">Klient</th>
                    <th className="px-6 py-4 font-medium">Plan / domena</th>
                    <th className="px-6 py-4 font-medium">Kwota</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Wystawiona</th>
                    <th className="px-6 py-4 text-right font-medium">PDF / hosted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.rows.map((inv) => (
                    <InvoiceRow key={inv.id} inv={inv} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && totalPages > 1 ? (
            <PageNav
              search={search}
              userId={userId}
              statuses={statuses}
              from={from}
              to={to}
              page={page}
              totalPages={totalPages}
            />
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Każde pobranie PDF/CSV jest zapisywane w audicie (akcja{" "}
        <code>ADMIN_INVOICE_PDF_DOWNLOADED</code> /{" "}
        <code>ADMIN_INVOICES_CSV_EXPORTED</code>).
      </p>
    </div>
  );
}

function InvoiceRow({ inv }: { inv: AdminInvoiceRow }) {
  return (
    <tr className="hover:bg-white/5 transition-colors">
      <td className="px-6 py-4">
        <div className="font-mono text-xs text-white">{inv.number}</div>
        {inv.providerRef ? (
          <div className="text-[10px] text-muted-foreground font-mono">{inv.providerRef}</div>
        ) : null}
      </td>
      <td className="px-6 py-4">
        <div className="font-medium text-white text-xs">
          {inv.user.companyName ?? inv.user.name ?? inv.user.email}
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Mail className="h-3 w-3" /> {inv.user.email}
        </div>
        <Link
          href={`/customers/${inv.user.id}`}
          className="text-[10px] text-indigo-300 hover:underline"
        >
          → profil
        </Link>
      </td>
      <td className="px-6 py-4 text-xs">
        {inv.subscription ? (
          <>
            <div className="text-white">{inv.subscription.planName ?? "—"}</div>
            <div className="text-muted-foreground font-mono text-[11px]">
              {inv.subscription.domain ?? "(brak domeny)"}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">— bez subskrypcji —</span>
        )}
      </td>
      <td className="px-6 py-4 text-sm tabular-nums text-white">
        {formatPlnAndCredits(inv.amount, inv.currency)}
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusTone(
            inv.status,
          )}`}
        >
          {statusLabel(inv.status)}
        </span>
      </td>
      <td className="px-6 py-4 text-xs text-muted-foreground">
        {inv.issuedAt ? new Date(inv.issuedAt).toLocaleString("pl-PL") : "—"}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="inline-flex items-center justify-end gap-2">
          {inv.hasVerrisPdf ? (
            <a
              href={`/api/invoices-pdf/${inv.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-200 hover:bg-white/10"
            >
              <FileText className="h-3 w-3" />
              PDF VFV
            </a>
          ) : null}
          {inv.hostedUrl ? (
            <a
              href={inv.hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-200 hover:bg-indigo-500/20"
            >
              <ExternalLink className="h-3 w-3" />
              Stripe Hosted
            </a>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function PageNav({
  search,
  userId,
  statuses,
  from,
  to,
  page,
  totalPages,
}: {
  search?: string;
  userId?: string;
  statuses?: AdminInvoiceStatus[];
  from?: string;
  to?: string;
  page: number;
  totalPages: number;
}) {
  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (userId) params.set("userId", userId);
    if (statuses && statuses.length > 0) params.set("status", statuses.join(","));
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/invoices?${qs}` : "/invoices";
  };

  return (
    <div className="flex items-center justify-end gap-2 p-4 border-t border-white/5">
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
    </div>
  );
}

function buildCsvHref(filters: {
  search?: string;
  userId?: string;
  statuses?: AdminInvoiceStatus[];
  from?: string;
  to?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.statuses && filters.statuses.length > 0) {
    params.set("status", filters.statuses.join(","));
  }
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();
  return qs ? `/api/invoices-csv?${qs}` : "/api/invoices-csv";
}
