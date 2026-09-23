import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { ChevronLeft, Clock, CheckCircle2, Sparkles } from "lucide-react";
import { StatusPill } from "@/components/panel/v2";
import { fetchTicketDetail } from "../actions";
import ClientTicketChat from "./client-ticket-chat";
import { TicketCsat } from "./ticket-csat";

export const dynamic = "force-dynamic";

export default async function ClientTicketPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ticket = await fetchTicketDetail(params.id);

  if (!ticket) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
        <Link href="/dashboard/support" className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-raised hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" />
          Centrum pomocy
        </Link>
        <span aria-hidden>/</span>
        <b className="font-mono font-semibold text-foreground">#{ticket.id.slice(-8).toUpperCase()}</b>
      </div>

      <header>
        <div className="font-mono text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
          zgłoszenie · {format(new Date(ticket.createdAt), "d MMMM yyyy, HH:mm", { locale: pl })}
        </div>
        <h1 className="mb-2 mt-1.5 break-words font-display text-[clamp(24px,3.4vw,34px)] font-extrabold leading-tight tracking-[-0.03em] text-foreground">
          {ticket.subject}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </header>

      <SlaBadge
        slaHours={ticket.supportSlaHours ?? 0}
        firstResponseAt={ticket.firstResponseAt ?? null}
        dueAt={ticket.slaResponseDueAt ?? null}
        status={ticket.status}
      />

      {/* Czat kontener */}
      <div className="flex h-[640px] max-h-[75vh] flex-col overflow-hidden rounded-[10px] border border-line bg-card">
        <ClientTicketChat ticket={ticket} />
      </div>

      {ticket.status === "CLOSED" ? (
        <TicketCsat ticketId={ticket.id} existingRating={ticket.csatRating ?? null} />
      ) : null}
    </div>
  );
}

function SlaBadge({
  slaHours,
  firstResponseAt,
  dueAt,
  status,
}: {
  slaHours: number;
  firstResponseAt: string | null;
  dueAt: string | null;
  status: string;
}) {
  if (slaHours <= 0) return null;
  if (firstResponseAt) {
    return (
      <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-4 py-2.5 text-sm text-emerald-200 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Odpowiedzieliśmy na to zgłoszenie. Gwarancja Twojego planu: pierwsza odpowiedź do {slaHours} h.
      </div>
    );
  }
  if (status === "CLOSED") return null;
  const due = dueAt ? new Date(dueAt) : null;
  // eslint-disable-next-line react-hooks/purity -- komponent serwerowy renderuje się raz na żądanie; czas żądania jest tu zamierzony
  const overdue = due ? due.getTime() < Date.now() : false;
  return (
    <div
      className={`rounded-lg border px-4 py-2.5 text-sm flex items-center gap-2 ${
        overdue ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-sky-400/25 bg-sky-400/5 text-sky-200"
      }`}
    >
      <Clock className="h-4 w-4" />
      {overdue
        ? `Przekraczamy gwarantowany czas odpowiedzi (${slaHours} h) — priorytetyzujemy Twoje zgłoszenie.`
        : `Gwarantowany czas pierwszej odpowiedzi wg Twojego planu: do ${slaHours} h${
            due ? ` (do ${format(due, "d MMM, HH:mm", { locale: pl })})` : ""
          }.`}
    </div>
  );
}

/** Pokazuje priorytet tylko gdy podwyższony (HIGH/URGENT) — np. dzięki dodatkowi
 * „Priorytetowe wsparcie". Dla NORMAL/LOW nic nie renderuje, by nie zaśmiecać. */
function PriorityBadge({ priority }: { priority?: string }) {
  const p = (priority ?? "").toUpperCase();
  if (p !== "HIGH" && p !== "URGENT") return null;
  const isUrgent = p === "URGENT";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border ${
        isUrgent
          ? "bg-rose-500/10 text-rose-200 border-rose-400/30"
          : "bg-amber-500/10 text-amber-200 border-amber-400/30"
      }`}
      title="Twoje zgłoszenie jest obsługiwane priorytetowo."
    >
      <Sparkles className="h-4 w-4" />
      {isUrgent ? "Priorytet pilny" : "Priorytet wysoki"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") return <StatusPill tone="data">Przyjęte — czeka na odpowiedź</StatusPill>;
  if (status === "IN_PROGRESS") return <StatusPill tone="data">Rozpatrujemy</StatusPill>;
  if (status === "WAITING_CUSTOMER") return <StatusPill tone="warn">Czekamy na Twoją odpowiedź</StatusPill>;
  return <StatusPill tone="muted">Zamknięte</StatusPill>;
}
