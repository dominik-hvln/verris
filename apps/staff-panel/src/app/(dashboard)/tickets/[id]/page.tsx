import Link from "next/link";
import { BladStrony } from "@/components/blad-strony";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StaffApiError } from "@/lib/staff-api";
import { staffGetTicket, staffGetTicketContext, staffListSupportAgents } from "@/lib/tickets-data";
import type { StaffTicketDetail } from "@/lib/tickets-data";
import { TicketDetailPanel } from "@/components/ticket-detail-panel";

export default async function StaffTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ticket: StaffTicketDetail;
  let agents: Awaited<ReturnType<typeof staffListSupportAgents>>;
  let context: Awaited<ReturnType<typeof staffGetTicketContext>>;
  try {
    ticket = await staffGetTicket(id);
    [agents, context] = await Promise.all([staffListSupportAgents(), staffGetTicketContext(id)]);
  } catch (err) {
    if (err instanceof StaffApiError && err.status === 404) notFound();
    return <BladStrony blad={err} tytul="Zgłoszenie" powrot={{ href: "/", label: "Powrót do skrzynki" }} />;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-cyan-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Powrót do skrzynki
      </Link>
      <TicketDetailPanel ticket={ticket as StaffTicketDetail} agents={agents} context={context} />
    </div>
  );
}
