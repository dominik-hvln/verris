import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { ChevronLeft, Clock, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/support"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">
            {ticket.subject}
          </h1>
          <p className="text-sm text-muted-foreground">
            Zgłoszenie #{ticket.id.slice(-8).toUpperCase()} utworzone {format(new Date(ticket.createdAt), "d MMMM yyyy, HH:mm", { locale: pl })}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      <div className="sm:hidden -mt-2 flex items-center gap-2">
        <PriorityBadge priority={ticket.priority} />
        <StatusBadge status={ticket.status} />
      </div>

      <SlaBadge
        slaHours={ticket.supportSlaHours ?? 0}
        firstResponseAt={ticket.firstResponseAt ?? null}
        dueAt={ticket.slaResponseDueAt ?? null}
        status={ticket.status}
      />

      {/* Czat kontener */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden flex flex-col h-[600px] max-h-[70vh]">
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
  if (status === "OPEN") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-sm font-medium text-white border border-white/20">
        <AlertCircle className="h-4 w-4" />
        Zgłoszenie otwarte
      </span>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1 text-sm font-medium text-neutral-300 border border-white/10">
        <Clock className="h-4 w-4" />
        Rozpatrywane
      </span>
    );
  }
  if (status === "WAITING_CUSTOMER") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-200 border border-amber-400/30">
        <Clock className="h-4 w-4" />
        Czekamy na Twoją odpowiedź
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground border border-border">
      <CheckCircle2 className="h-4 w-4" />
      Zamknięte
    </span>
  );
}
