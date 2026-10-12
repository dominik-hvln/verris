import { BladStrony } from "@/components/blad-strony";
import { notFound } from "next/navigation";
import { StaffApiError } from "@/lib/staff-api";
import { requireStaffSession } from "@/lib/staff-session";
import { staffGetTicket, staffGetTicketContext, staffKandydaciScalenia, staffListSupportAgents, staffMakra, staffMojeOceny, staffZleceniaDodatkow } from "@/lib/tickets-data";
import type { StaffTicketDetail } from "@/lib/tickets-data";
import { TicketDetailPanel } from "@/components/ticket-detail-panel";
import { maUprawnienie, mozeWejscNaKonto, pobierzDostepOperatora } from "@/lib/staff-access";

export default async function StaffTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffSession();
  let ticket: StaffTicketDetail;
  let agents: Awaited<ReturnType<typeof staffListSupportAgents>>;
  let context: Awaited<ReturnType<typeof staffGetTicketContext>>;
  let oceny: Awaited<ReturnType<typeof staffMojeOceny>>;
  let dostep: Awaited<ReturnType<typeof pobierzDostepOperatora>>;
  let makra: Awaited<ReturnType<typeof staffMakra>>;
  let kandydaci: Awaited<ReturnType<typeof staffKandydaciScalenia>>;
  let zlecenia: Awaited<ReturnType<typeof staffZleceniaDodatkow>>;
  try {
    // Otwarcie przez przypisanego opiekuna = „przeczytane” u klienta (PB-37), dlatego najpierw samo zgłoszenie.
    ticket = await staffGetTicket(id);
    [agents, context, oceny, dostep, makra, kandydaci, zlecenia] = await Promise.all([
      staffListSupportAgents(),
      staffGetTicketContext(id),
      staffMojeOceny(session.id),
      pobierzDostepOperatora(),
      staffMakra(id),
      staffKandydaciScalenia(id),
      staffZleceniaDodatkow(id),
    ]);
  } catch (err) {
    if (err instanceof StaffApiError && err.status === 404) notFound();
    return <BladStrony blad={err} tytul="Zgłoszenie" powrot={{ href: "/", label: "Powrót do skrzynki" }} />;
  }

  // eslint-disable-next-line react-hooks/purity -- komponent serwerowy renderuje się raz na żądanie; czas żądania jest tu zamierzony
  const teraz = Date.now();
  return (
    <TicketDetailPanel
      ticket={ticket}
      agents={agents}
      context={context}
      mojeOceny={oceny}
      teraz={teraz}
      mozeWejscNaKonto={mozeWejscNaKonto(dostep)}
      makra={makra}
      kandydaciScalenia={kandydaci}
      // F3.7 — scala sam z TICKETS_MERGE (L3+); niżej „Wyślij wniosek”. Egzekucja w API.
      mozeScalic={maUprawnienie(dostep, "TICKETS_MANAGE") && maUprawnienie(dostep, "TICKETS_MERGE")}
      // M-33 — zlecenie dodatku: realizacja L2+ (SUBSCRIPTIONS_MANAGE), odmowa ze zwrotem L4 (+ BILLING_MANAGE). Egzekucja w API.
      zleceniaDodatkow={zlecenia}
      mozeRealizowacDodatek={maUprawnienie(dostep, "SUBSCRIPTIONS_MANAGE")}
      mozeZwrocicDodatek={maUprawnienie(dostep, "SUBSCRIPTIONS_MANAGE") && maUprawnienie(dostep, "BILLING_MANAGE")}
    />
  );
}
