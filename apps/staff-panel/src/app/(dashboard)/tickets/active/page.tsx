import Link from "next/link";
import { staffGetTickets, type StaffTicketRow } from "@/lib/tickets-data";
import { StaffApiError } from "@/lib/staff-api";

export const dynamic = "force-dynamic";

export default async function ActiveTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const { userId: filterUserId } = await searchParams;

  let rows: StaffTicketRow[] = [];
  let error: string | null = null;
  try {
    rows = await staffGetTickets(filterUserId);
  } catch (e) {
    error =
      e instanceof StaffApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Nie udało się pobrać zgłoszeń.";
  }

  rows = rows
    .filter((t) => t.status !== "CLOSED")
    .filter((t) => t.status === "IN_PROGRESS");

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      <div>
        <h1 className="text-3xl font-bold text-white">W realizacji</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zgłoszenia w statusie „W realizacji” (nad którymi aktywnie pracujesz).
          {filterUserId ? (
            <>
              {" "}
              <span className="text-cyan-200/90">Filtrowanie po kliencie.</span>{" "}
              <Link href="/tickets/active" className="text-cyan-400 hover:underline">
                Wyczyść
              </Link>
              {" · "}
              <Link href={`/crm/${filterUserId}`} className="text-cyan-400 hover:underline">
                Profil
              </Link>
            </>
          ) : null}
        </p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/30">
        <ul className="divide-y divide-white/5">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-stretch justify-between gap-2 border-b border-white/5 last:border-0">
              <Link
                href={`/tickets/${t.id}`}
                className="min-w-0 flex-1 px-6 py-4 hover:bg-white/[0.04] text-sm transition-colors text-white"
              >
                <span className="font-medium truncate block">#{t.id.slice(0, 8)} — {t.subject}</span>
                <span className="text-muted-foreground text-xs block mt-1">
                  {[t.user.firstName, t.user.lastName].filter(Boolean).join(" ") || t.user.email}
                </span>
              </Link>
              <div className="flex items-center gap-2 px-4 py-4">
                <Link
                  href={`/crm/${t.user.id}`}
                  className="shrink-0 rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200 hover:bg-cyan-500/20"
                >
                  Profil
                </Link>
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 ? (
          <div className="py-14 text-center text-muted-foreground text-sm">Nic w tym koszyku.</div>
        ) : null}
      </div>
    </div>
  );
}
