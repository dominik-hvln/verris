import Link from "next/link";
import { staffGetTickets, type StaffTicketRow } from "@/lib/tickets-data";
import { StaffApiError } from "@/lib/staff-api";

export const dynamic = "force-dynamic";

export default async function ActiveTicketsPage() {
  let rows: StaffTicketRow[] = [];
  let error: string | null = null;
  try {
    rows = await staffGetTickets();
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
        </p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/30">
        <ul className="divide-y divide-white/5">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tickets/${t.id}`}
                className="block px-6 py-4 hover:bg-white/[0.04] text-sm transition-colors text-white flex justify-between gap-4 flex-wrap"
              >
                <span className="font-medium truncate">#{t.id.slice(0, 8)} — {t.subject}</span>
                <span className="text-muted-foreground text-xs">
                  {[t.user.firstName, t.user.lastName].filter(Boolean).join(" ") || t.user.email}
                </span>
              </Link>
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
