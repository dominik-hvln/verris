import Link from "next/link";
import { adminApi } from "@/lib/api";

export const dynamic = "force-dynamic";

type AdminTicket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  department: string;
  createdAt: string;
  user: { email: string };
};

export default async function AdminTicketsPage() {
  let rows: AdminTicket[] = [];
  let error: string | null = null;
  const staffPanelUrl = panelUrl("NEXT_PUBLIC_STAFF_PANEL_URL", 3002);
  // Internal admin fallback so the page never 500s when the BOK URL is unset.
  const ticketHref = (ticketId: string) =>
    staffPanelUrl
      ? new URL(`/tickets/${ticketId}`, staffPanelUrl).toString()
      : `/tickets/${ticketId}`;
  try {
    rows = await adminApi<AdminTicket[]>("/tickets/admin/all");
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się pobrać ticketów.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">Tickety</h1>
        <p className="mt-2 text-sm text-muted-foreground">Wszystkie zgłoszenia supportowe (widok operacyjny admina).</p>
      </header>
      {error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/35">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Temat</th>
                <th className="px-4 py-3">Klient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Priorytet</th>
                <th className="px-4 py-3">Dział</th>
                <th className="px-4 py-3">Utworzono</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">{ticket.subject}</td>
                  <td className="px-4 py-3 text-muted-foreground">{ticket.user.email}</td>
                  <td className="px-4 py-3">{ticket.status}</td>
                  <td className="px-4 py-3">{ticket.priority}</td>
                  <td className="px-4 py-3">{ticket.department}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(ticket.createdAt).toLocaleString("pl-PL")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={ticketHref(ticket.id)}
                      target={staffPanelUrl ? "_blank" : undefined}
                      rel={staffPanelUrl ? "noreferrer" : undefined}
                      className="text-xs text-indigo-400 hover:underline"
                    >
                      {staffPanelUrl ? "Otwórz w BOK" : "Szczegóły"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground text-sm">Brak ticketów.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function panelUrl(envName: string, devPort: number): string | null {
  const value = process.env[envName]?.trim();
  if (value) return value.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return `http://${"localhost"}:${devPort}`;
  // In production without the env set we degrade gracefully instead of throwing,
  // so the tickets page still renders (with an internal link fallback).
  return null;
}
