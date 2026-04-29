import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StaffApiError } from "@/lib/staff-api";
import { staffGetTicket, staffListSupportAgents } from "@/lib/tickets-data";
import type { StaffTicketDetail } from "@/lib/tickets-data";
import { TicketDetailPanel } from "@/components/ticket-detail-panel";

export default async function StaffTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ticket: StaffTicketDetail;
  try {
    ticket = await staffGetTicket(id);
  } catch (err) {
    if (err instanceof StaffApiError && err.status === 404) notFound();
    throw err;
  }
  const agents = await staffListSupportAgents();

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-cyan-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Powrót do skrzynki
      </Link>
      <TicketDetailPanel ticket={ticket as StaffTicketDetail} agents={agents} />
    </div>
  );
}
