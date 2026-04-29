import Link from "next/link";
import { AlertCircle, Clock, ChevronRight, MessageSquare } from "lucide-react";
import { staffGetTickets } from "@/lib/tickets-data";

const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export default async function StaffInboxPage() {
  let rows = await staffGetTickets();
  rows = [...rows]
    .filter((t) => t.status !== "CLOSED")
    .sort((a, b) => {
      const pr = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pr !== 0) return pr;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const openCount = rows.filter((t) => t.status === "OPEN").length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">Skrzynka zgłoszeń</h1>
          <p className="mt-2 text-sm text-muted-foreground">Wszystkie otwarte i w toku (bez zamkniętych).</p>
        </div>
        <div className="flex gap-4">
          <Stat label="Aktywnych" value={rows.length} tone="cyan" />
          <Stat label="Status OPEN" value={openCount} tone="amber" />
        </div>
      </header>

      <div className="relative rounded-2xl border border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="divide-y divide-white/5">
          {rows.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/tickets/${ticket.id}`}
              className="group flex items-start justify-between gap-4 px-6 py-4 hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  {ticket.priority === "HIGH" || ticket.priority === "URGENT" ? (
                    <AlertCircle className={`h-4 w-4 text-rose-400`} />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-cyan-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-mono text-muted-foreground">#{ticket.id.slice(0, 8)}</p>
                  <h3 className="truncate text-sm font-semibold text-white">{ticket.subject}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {[ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(" ") ||
                      ticket.user.email}{" "}
                    · {ticket.department}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-4">
                <div className="text-right text-xs">
                  <Badge status={ticket.status} />
                  <p className="mt-2 flex items-center justify-end gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(ticket.createdAt).toLocaleString("pl-PL")}
                  </p>
                  <p className="mt-1 text-muted-foreground">{ticket._count.replies} odpowiedzi</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="px-8 py-20 text-center text-muted-foreground">Brak oczekujących zgłoszeń — gratulacje!</div>
        ) : null}
      </div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    OPEN: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    IN_PROGRESS: "border-amber-500/25 bg-amber-500/10 text-amber-100",
    CLOSED: "border-white/10 bg-white/5 text-neutral-400",
  };
  const label: Record<string, string> = {
    OPEN: "Otwarte",
    IN_PROGRESS: "W realizacji",
    CLOSED: "Zamknięte",
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${palette[status] ?? "border-white/10 bg-white/5 text-white"}`}
    >
      {label[status] ?? status}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "cyan" | "amber" }) {
  const cls =
    tone === "cyan"
      ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-300"
      : "border-amber-500/25 bg-amber-500/10 text-amber-200";
  return (
    <div className={`flex min-w-[100px] flex-col items-center justify-center rounded-xl border px-4 py-2 ${cls}`}>
      <span className="text-2xl font-black">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</span>
    </div>
  );
}
