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

  // eslint-disable-next-line react-hooks/purity -- komponent serwerowy renderuje się raz na żądanie; czas żądania jest tu zamierzony
  const teraz = Date.now();
  const zamkniete = ticket.status === "CLOSED";
  const ludzkie = ticket.replies.filter((r) => !r.automatic);
  const ostatniaMoja = [ticket.createdAt, ...ludzkie.filter((r) => !r.isStaff).map((r) => r.createdAt)].sort().at(-1)!;
  const odpowiedz = ludzkie.filter((r) => r.isStaff).map((r) => r.createdAt).sort().at(-1) ?? null;
  const przeczytane = ticket.staffReadAt && ticket.staffReadAt >= ostatniaMoja ? ticket.staffReadAt : null;
  const kiedyZamkniete = ticket.resolvedAt ?? ticket.autoClosedAt ?? null;
  const moznaOtworzyc = zamkniete && !!kiedyZamkniete && teraz - new Date(kiedyZamkniete).getTime() < 7 * 86_400_000;
  const kroki: { nazwa: string; kiedy: string | null; gotowe: boolean }[] = [
    { nazwa: "Przyjęte", kiedy: ticket.createdAt, gotowe: true },
    { nazwa: ticket.opiekun ? `Opiekun: ${ticket.opiekun}` : "Przydzielamy opiekuna", kiedy: ticket.opiekun ? ticket.createdAt : null, gotowe: !!ticket.opiekun },
    { nazwa: "Przeczytane", kiedy: przeczytane, gotowe: !!przeczytane },
    { nazwa: "Odpowiedź", kiedy: odpowiedz && odpowiedz >= ostatniaMoja ? odpowiedz : null, gotowe: !!odpowiedz && odpowiedz >= ostatniaMoja },
    { nazwa: "Rozwiązane", kiedy: zamkniete ? kiedyZamkniete : null, gotowe: zamkniete },
  ];
  const godz = (d: string) => format(new Date(d), "d MMM, HH:mm", { locale: pl });

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
        <Link href="/dashboard/support" className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-raised hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" />
          Centrum pomocy
        </Link>
        <span aria-hidden>/</span>
        <b className="font-mono font-semibold text-foreground">#{ticket.id.slice(0, 8)}</b>
      </div>

      <div className="grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <header>
            <div className="font-mono text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
              zgłoszenie #{ticket.id.slice(0, 8)} · wysłane {format(new Date(ticket.createdAt), "d MMMM yyyy, HH:mm", { locale: pl })}
            </div>
            <h1 className="mb-2 mt-1.5 break-words font-display text-[clamp(24px,3.4vw,30px)] font-extrabold leading-tight tracking-[-0.03em] text-foreground">
              {ticket.subject}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
          </header>

          {/* PB-37 — postęp: klient zawsze widzi, na jakim etapie jest sprawa */}
          <section className="grid grid-cols-2 gap-3 rounded-[10px] border border-line bg-card px-[18px] py-4 sm:grid-cols-5" aria-label="Postęp zgłoszenia">
            {kroki.map((k) => (
              <div key={k.nazwa} className="flex flex-col gap-1.5">
                <div className={`h-1 rounded-sm ${k.gotowe ? "bg-verris-green" : "bg-line-strong"}`} />
                <b className={`text-[13.5px] ${k.gotowe ? "" : "text-muted-foreground"}`}>{k.nazwa}</b>
                <span className="text-xs text-muted-foreground">{k.kiedy ? godz(k.kiedy) : "—"}</span>
              </div>
            ))}
          </section>

          {/* Czat kontener */}
          <div className="flex h-[640px] max-h-[75vh] flex-col overflow-hidden rounded-[10px] border border-line bg-card">
            <ClientTicketChat ticket={ticket} />
          </div>

          {zamkniete ? (
            <TicketCsat
              ticketId={ticket.id}
              opiekun={ticket.opiekun ?? null}
              existingRating={ticket.csatRating ?? null}
              existingAgentRating={ticket.agentRating ?? null}
              existingResolved={ticket.csatResolved ?? null}
              moznaOtworzyc={moznaOtworzyc}
            />
          ) : null}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <section className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-card p-4" aria-labelledby="op">
            <div className="flex items-center gap-2.5">
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-verris-green font-bold text-verris-paper">
                {(ticket.opiekun ?? "V").split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <div className="flex flex-col">
                <h2 id="op" className="font-display text-[15px] font-bold">
                  {ticket.opiekun ?? "Zespół Verris"}
                </h2>
                <span className="text-[12.5px] text-muted-foreground">{ticket.opiekun ? "opiekun Twojego zgłoszenia" : "przydzielamy opiekuna"}</span>
              </div>
            </div>
            <SlaBadge
              slaHours={ticket.supportSlaHours ?? 0}
              firstResponseAt={ticket.firstResponseAt ?? null}
              dueAt={ticket.slaResponseDueAt ?? null}
              status={ticket.status}
            />
            <span className="text-[13.5px] leading-[1.5]">O każdej zmianie napiszemy e-mailem — nie musisz tu zaglądać.</span>
          </section>
          <section className="flex flex-col gap-2 rounded-[10px] border border-line bg-card p-4" aria-labelledby="cd">
            <h2 id="cd" className="font-display text-[15px] font-bold">
              Co się dzieje, gdy…
            </h2>
            <span className="text-[13px] leading-[1.5]">
              <b>naprawa trwa dłużej</b> — dostaniesz informację „wciąż nad tym pracujemy”, najwyżej raz na dobę;
            </span>
            <span className="text-[13px] leading-[1.5]">
              <b>czekamy na Ciebie</b> — przypomnimy po 2 dniach, zamkniemy po 5 (zawsze możesz otworzyć ponownie przez 7 dni).
            </span>
          </section>
        </aside>
      </div>
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
      <p className="flex items-center gap-2 text-[13.5px] text-data-hi">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Odpowiedzieliśmy — w Twoim planie pierwsza odpowiedź jest do {slaHours} h.
      </p>
    );
  }
  if (status === "CLOSED") return null;
  const due = dueAt ? new Date(dueAt) : null;
  // eslint-disable-next-line react-hooks/purity -- komponent serwerowy renderuje się raz na żądanie; czas żądania jest tu zamierzony
  const overdue = due ? due.getTime() < Date.now() : false;
  return (
    <p className={`flex items-start gap-2 text-[13.5px] leading-[1.5] ${overdue ? "text-warn" : ""}`}>
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      {overdue ? (
        <span>Przekraczamy gwarantowany czas odpowiedzi ({slaHours} h) — Twoje zgłoszenie ma pierwszeństwo.</span>
      ) : (
        <span>
          Odpowiadamy najpóźniej w <b>{slaHours} h</b> w Twoim planie{due ? ` (do ${format(due, "d MMM, HH:mm", { locale: pl })})` : ""}.
        </span>
      )}
    </p>
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
