import Link from "next/link";
import { adminApi } from "@/lib/api";
import { TICKET_DEPARTMENT_PL, TICKET_PRIORITY_PL, TICKET_STATUS_PL, etykieta } from "@verris/contracts";
import { Eyebrow, KARTA, Pigulka, PRZYCISK, WIERSZ } from "@/components/v2";

export const dynamic = "force-dynamic";

type AdminTicket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  department: string;
  createdAt: string;
  slaResponseDueAt?: string | null;
  firstResponseAt?: string | null;
  assignedTo?: { firstName: string | null; lastName: string | null } | null;
  user: { email: string; companyName?: string | null; firstName?: string | null; lastName?: string | null };
};

const WIDOKI = { otwarte: "Otwarte", "po-terminie": "Po terminie SLA", zamkniete: "Zamknięte", wszystkie: "Wszystkie" } as const;
type Widok = keyof typeof WIDOKI;
const teraz = () => Date.now();

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<{ widok?: string }> }) {
  const q = await searchParams;
  const widok: Widok = (q.widok ?? "") in WIDOKI ? (q.widok as Widok) : "otwarte";
  let rows: AdminTicket[] = [];
  let error: string | null = null;
  const staffPanelUrl = panelUrl("NEXT_PUBLIC_STAFF_PANEL_URL", 3002);
  // N-20 — szczegół zgłoszenia żyje w panelu BOK. Dawny fallback `/tickets/:id` prowadził
  // do nieistniejącej trasy admina (404); bez zmiennej środowiskowej idziemy na adres produkcyjny.
  const ticketHref = (ticketId: string) =>
    new URL(`/tickets/${ticketId}`, staffPanelUrl ?? "https://staff.verris.pl").toString();
  try {
    rows = await adminApi<AdminTicket[]>("/tickets/admin/all");
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się pobrać ticketów.";
  }

  const chwila = teraz();
  const poTerminie = (t: AdminTicket) => t.status !== "CLOSED" && !t.firstResponseAt && !!t.slaResponseDueAt && new Date(t.slaResponseDueAt).getTime() < chwila;
  const filtry: Record<Widok, (t: AdminTicket) => boolean> = {
    otwarte: (t) => t.status !== "CLOSED",
    "po-terminie": poTerminie,
    zamkniete: (t) => t.status === "CLOSED",
    wszystkie: () => true,
  };
  // Po terminie na górze — to je trzeba ruszyć najpierw.
  const widoczne = rows.filter(filtry[widok]).sort((a, b) => Number(poTerminie(b)) - Number(poTerminie(a)));

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>Klienci i usługi</Eyebrow>
          <h1 className="text-[32px] lg:text-[40px]">Zgłoszenia</h1>
          <span className="text-[15px] text-muted-foreground">Widok admina — odpowiadanie i przypisywanie odbywa się w panelu obsługi.</span>
        </div>
        {staffPanelUrl ? (
          <a href={staffPanelUrl} target="_blank" rel="noreferrer" className={`${PRZYCISK} ml-auto`}>
            Otwórz skrzynkę obsługi ↗
          </a>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Widok">
        {(Object.keys(WIDOKI) as Widok[]).map((k) => (
          <Link
            key={k}
            href={k === "otwarte" ? "/tickets" : `/tickets?widok=${k}`}
            aria-current={widok === k ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-[13px] ${widok === k ? "border-primary bg-data-soft font-semibold text-data-hi" : "border-line-strong text-muted-foreground hover:text-foreground"}`}
          >
            {WIDOKI[k]} · {rows.filter(filtry[k]).length}
          </Link>
        ))}
      </div>
      {error ? (
        <p className="text-sm text-crit">{error}</p>
      ) : (
        <section className={KARTA} aria-label="Zgłoszenia">
          {widoczne.length === 0 ? <div className={`${WIERSZ} !border-t-0 text-sm text-muted-foreground`}>Brak zgłoszeń w tym widoku.</div> : null}
          {widoczne.map((t, i) => {
            const klient = t.user.companyName?.trim() || [t.user.firstName, t.user.lastName].filter(Boolean).join(" ") || t.user.email;
            const opiekun = t.assignedTo ? [t.assignedTo.firstName, t.assignedTo.lastName].filter(Boolean).join(" ") || "przypisane" : "nieprzypisane";
            return (
              <a key={t.id} href={ticketHref(t.id)} target={staffPanelUrl ? "_blank" : undefined} rel={staffPanelUrl ? "noreferrer" : undefined} className={`${WIERSZ} ${i === 0 ? "!border-t-0" : ""} hover:bg-raised`}>
                <span className={`w-1 self-stretch rounded-sm ${poTerminie(t) ? "bg-crit" : t.priority === "URGENT" || t.priority === "HIGH" ? "bg-warn" : "bg-transparent"}`} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{t.subject}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    #{t.id.slice(0, 8)} · {klient} · {etykieta(TICKET_DEPARTMENT_PL, t.department)} · {etykieta(TICKET_PRIORITY_PL, t.priority)} · {opiekun}
                  </span>
                </span>
                <span className="hidden w-[110px] font-mono text-xs text-muted-foreground md:block">
                  {new Date(t.createdAt).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).replace(",", "")}
                </span>
                <span className="w-[140px]">
                  {poTerminie(t) ? (
                    <Pigulka ton="crit" className="!text-xs">po terminie SLA</Pigulka>
                  ) : (
                    <Pigulka ton={t.status === "CLOSED" ? "muted" : t.status === "WAITING_CUSTOMER" ? "muted" : "warn"} className="!text-xs">
                      {etykieta(TICKET_STATUS_PL, t.status).toLowerCase()}
                    </Pigulka>
                  )}
                </span>
              </a>
            );
          })}
        </section>
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
