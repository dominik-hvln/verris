import { bramkaStrony } from "@/lib/bramka-strony";
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

type ListaZgloszen = {
  rows: AdminTicket[];
  total: number;
  page: number;
  totalPages: number;
  liczby: { otwarte: number; poTerminie: number; zamkniete: number };
};

const WIDOKI = { otwarte: "Otwarte", "po-terminie": "Po terminie SLA", zamkniete: "Zamknięte", wszystkie: "Wszystkie" } as const;
type Widok = keyof typeof WIDOKI;
const teraz = () => Date.now();
/** F2.5 — widok → filtry API skrzynki (filtry, wyszukiwanie i stronicowanie liczy API, nie ta strona). */
const FILTR_WIDOKU: Record<Widok, Record<string, string>> = {
  otwarte: { stan: "otwarte", sort: "termin" },
  "po-terminie": { sla: "po-terminie", sort: "termin" },
  zamkniete: { stan: "zamkniete", sort: "zamkniete" },
  wszystkie: { sort: "najnowsze" },
};

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<{ widok?: string; q?: string; page?: string }> }) {
  const bramka = await bramkaStrony("/tickets");
  if (bramka) return bramka;
  const q = await searchParams;
  const widok: Widok = (q.widok ?? "") in WIDOKI ? (q.widok as Widok) : "otwarte";
  const fraza = q.q?.trim() ?? "";
  const strona = Math.max(1, Number.parseInt(q.page ?? "", 10) || 1);
  let lista: ListaZgloszen | null = null;
  let error: string | null = null;
  const staffPanelUrl = panelUrl("NEXT_PUBLIC_STAFF_PANEL_URL", 3002);
  // N-20 — szczegół zgłoszenia żyje w panelu BOK. Dawny fallback `/tickets/:id` prowadził
  // do nieistniejącej trasy admina (404); bez zmiennej środowiskowej idziemy na adres produkcyjny.
  const ticketHref = (ticketId: string) =>
    new URL(`/tickets/${ticketId}`, staffPanelUrl ?? "https://staff.verris.pl").toString();
  const parametry = new URLSearchParams({ ...FILTR_WIDOKU[widok], limit: "50", ...(fraza ? { q: fraza } : {}), ...(strona > 1 ? { page: String(strona) } : {}) });
  try {
    lista = await adminApi<ListaZgloszen>(`/tickets/admin/all?${parametry.toString()}`);
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się pobrać zgłoszeń.";
  }

  const chwila = teraz();
  const poTerminie = (t: AdminTicket) => t.status !== "CLOSED" && !t.firstResponseAt && !!t.slaResponseDueAt && new Date(t.slaResponseDueAt).getTime() < chwila;
  // Kolejność (po terminie na górze) i filtr widoku — z API.
  const widoczne = lista?.rows ?? [];
  const l = lista?.liczby;
  const liczbaWidoku: Record<Widok, number | null> = l
    ? { otwarte: l.otwarte, "po-terminie": l.poTerminie, zamkniete: l.zamkniete, wszystkie: l.otwarte + l.zamkniete }
    : { otwarte: null, "po-terminie": null, zamkniete: null, wszystkie: null };
  const link = (o: { widok?: Widok; page?: number }) => {
    const w = o.widok ?? widok;
    const p = new URLSearchParams({ ...(w !== "otwarte" ? { widok: w } : {}), ...(fraza ? { q: fraza } : {}), ...(o.page && o.page > 1 ? { page: String(o.page) } : {}) }).toString();
    return p ? `/tickets?${p}` : "/tickets";
  };

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
            href={link({ widok: k })}
            aria-current={widok === k ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-[13px] ${widok === k ? "border-primary bg-data-soft font-semibold text-data-hi" : "border-line-strong text-muted-foreground hover:text-foreground"}`}
          >
            {WIDOKI[k]}
            {liczbaWidoku[k] == null ? "" : ` · ${liczbaWidoku[k]}`}
          </Link>
        ))}
      </div>
      <form method="get" action="/tickets" className="flex flex-wrap items-center gap-2" aria-label="Szukaj zgłoszeń">
        {widok !== "otwarte" ? <input type="hidden" name="widok" value={widok} /> : null}
        <input
          name="q"
          defaultValue={fraza}
          aria-label="Szukaj"
          placeholder="Szukaj: temat, treść, klient, #numer…"
          className="h-[34px] min-w-[260px] flex-1 rounded-lg border border-line-strong bg-card px-2.5 text-[13px] text-foreground outline-none focus:border-primary"
        />
        <button type="submit" className={`${PRZYCISK} !h-[34px] !text-[13px]`}>
          Szukaj
        </button>
      </form>
      {error ? (
        <p className="text-sm text-crit">{error}</p>
      ) : (
        <section className={KARTA} aria-label="Zgłoszenia">
          {widoczne.length === 0 ? <div className={`${WIERSZ} !border-t-0 text-sm text-muted-foreground`}>{fraza ? "Nic nie pasuje do wyszukiwania." : "Brak zgłoszeń w tym widoku."}</div> : null}
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
      {lista && lista.totalPages > 1 ? (
        <nav aria-label="Strony" className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <span>
            Strona {lista.page} z {lista.totalPages} · {lista.total} zgłoszeń
          </span>
          <span className="flex gap-2">
            {lista.page > 1 ? (
              <Link href={link({ page: lista.page - 1 })} className={`${PRZYCISK} !h-8 !text-[13px]`}>
                ← Poprzednia
              </Link>
            ) : null}
            {lista.page < lista.totalPages ? (
              <Link href={link({ page: lista.page + 1 })} className={`${PRZYCISK} !h-8 !text-[13px]`}>
                Następna →
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
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
