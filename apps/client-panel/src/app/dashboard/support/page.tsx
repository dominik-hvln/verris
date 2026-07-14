"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpinBorder } from "@/components/spin-border";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  HelpCircle,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { fetchTickets, type TicketSummary } from "./actions";
import { PageHeaderRow } from "@/components/panel";

export default function SupportPage() {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTickets().then((data) => {
      setTickets(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <PageHeaderRow
        title="Pomoc techniczna"
        description="Zgłoś problem lub skontaktuj się z naszym zespołem wsparcia."
        actions={
          <Link
            href="/dashboard/support/new"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black transition-all hover:bg-neutral-200 sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            Nowe zgłoszenie
          </Link>
        }
      />

      <div className="relative rounded-[24px] p-px overflow-hidden shadow-2xl group transition-transform duration-300 hover:-translate-y-1">
        <SpinBorder variant="white" className="opacity-20 transition-opacity duration-[1500ms]" />
        <div className="relative h-full w-full bg-[#0a0a0a] group-hover:bg-[#121212] transition-colors duration-300 rounded-[calc(24px-1px)] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-white mb-4" />
            <p className="text-neutral-400 font-medium">Wczytywanie zgłoszeń...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-[20px] bg-white/5 border border-white/10 shadow-inner mb-6">
               <HelpCircle className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Brak aktywnych zgłoszeń</h3>
            <p className="text-neutral-400 max-w-md">
              Nie masz jeszcze żadnych otwartych ticketów wsparcia. Jeśli potrzebujesz pomocy, utwórz nowe zgłoszenie do naszego zespołu.
            </p>
            <Link
              href="/dashboard/support/new"
              className="mt-8 inline-flex items-center justify-center rounded-[16px] bg-white/5 border border-white/10 px-6 py-3 font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Skontaktuj się z nami
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/dashboard/support/${ticket.id}`}
                className="group flex flex-col sm:flex-row sm:items-center p-6 hover:bg-neutral-900/50 transition-all gap-5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-4 mb-2">
                    <StatusBadge status={ticket.status} />
                    <span className="text-base font-bold text-neutral-300 truncate group-hover:text-white transition-colors">
                      {ticket.subject}
                    </span>
                  </div>
                  <div className="flex items-center gap-5 text-sm text-neutral-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-neutral-500" />
                      {format(new Date(ticket.updatedAt), "d MMM yyyy, HH:mm", { locale: pl })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-neutral-500" />
                      {ticket._count.replies} odpowiedzi
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex shrink-0">
                  <div className="p-3 rounded-[12px] bg-white/5 text-neutral-400 group-hover:text-white group-hover:bg-white/10 group-hover:scale-110 border border-transparent group-hover:border-white/10 transition-all">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-white border border-white/10 uppercase tracking-wider">
        <AlertCircle className="h-3 w-3" />
        Oczekujące
      </span>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white border border-white/20 uppercase tracking-wider">
        <Clock className="h-3 w-3" />
        W toku
      </span>
    );
  }
  if (status === "WAITING_CUSTOMER") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-200 border border-amber-400/30 uppercase tracking-wider">
        <Clock className="h-3 w-3" />
        Czekamy na Ciebie
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#050505] px-3 py-1 text-xs font-bold text-neutral-400 border border-white/5 uppercase tracking-wider">
      <CheckCircle2 className="h-3 w-3" />
      Rozwiązane
    </span>
  );
}
