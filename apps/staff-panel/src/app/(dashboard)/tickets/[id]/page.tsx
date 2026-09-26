import { BladStrony } from "@/components/blad-strony";
import { notFound } from "next/navigation";
import { StaffApiError } from "@/lib/staff-api";
import { requireStaffSession } from "@/lib/staff-session";
import { staffGetTicket, staffGetTicketContext, staffListSupportAgents, staffMojeOceny } from "@/lib/tickets-data";
import type { StaffTicketDetail } from "@/lib/tickets-data";
import { TicketDetailPanel } from "@/components/ticket-detail-panel";

export default async function StaffTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffSession();
  let ticket: StaffTicketDetail;
  let agents: Awaited<ReturnType<typeof staffListSupportAgents>>;
  let context: Awaited<ReturnType<typeof staffGetTicketContext>>;
  let oceny: Awaited<ReturnType<typeof staffMojeOceny>>;
  try {
    // Otwarcie przez przypisanego opiekuna = „przeczytane” u klienta (PB-37), dlatego najpierw samo zgłoszenie.
    ticket = await staffGetTicket(id);
    [agents, context, oceny] = await Promise.all([staffListSupportAgents(), staffGetTicketContext(id), staffMojeOceny(session.id)]);
  } catch (err) {
    if (err instanceof StaffApiError && err.status === 404) notFound();
    return <BladStrony blad={err} tytul="Zgłoszenie" powrot={{ href: "/", label: "Powrót do skrzynki" }} />;
  }

  // eslint-disable-next-line react-hooks/purity -- komponent serwerowy renderuje się raz na żądanie; czas żądania jest tu zamierzony
  const teraz = Date.now();
  return <TicketDetailPanel ticket={ticket} agents={agents} context={context} mojeOceny={oceny} teraz={teraz} />;
}
