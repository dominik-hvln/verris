import Link from "next/link";
import type { TicketContext } from "@/lib/tickets-data";
import { INVOICE_STATUS_PL, SERVICE_EVENT_PL, SUBSCRIPTION_STATUS_PL, TICKET_STATUS_PL, etykieta } from "@verris/contracts";
import { StaffImpersonateButton } from "@/app/(dashboard)/crm/impersonate-button";

// Wewnątrz zdania („Starter · anulowana”) — stąd małe litery.
const maleLitery = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.toLowerCase()]));
const SUB_STATUS = maleLitery(SUBSCRIPTION_STATUS_PL);
const INV_STATUS = maleLitery(INVOICE_STATUS_PL);
const TICKET_STATUS = maleLitery(TICKET_STATUS_PL);

const TZ = "Europe/Warsaw";
const dzien = (s: string | null) => (s ? new Date(s).toLocaleDateString("pl-PL", { timeZone: TZ }) : "—");
const dzienGodz = (s: string) => new Date(s).toLocaleString("pl-PL", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ton = (score: number | null) => (score == null ? "text-muted-foreground" : score >= 80 ? "text-data-hi" : score >= 50 ? "text-warn" : "text-crit");

function inicjaly(nazwa: string): string {
  const s = nazwa.split(/\s+/).filter(Boolean);
  return ((s[0]?.[0] ?? "") + (s[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Karta({ tytul, children, id }: { tytul?: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="rounded-[10px] border border-line bg-card" aria-labelledby={id}>
      {tytul ? (
        <div className="px-4 py-3.5">
          <h2 id={id} className="font-display text-[15px] font-bold">
            {tytul}
          </h2>
        </div>
      ) : null}
      {children}
    </section>
  );
}

const Wiersz = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-3 border-t border-line px-4 py-[11px]">{children}</div>
);

/** PB-18 / PB-34 — boczny podgląd klienta (makieta „Obsługa · Zgłoszenie”): wszystko do odpowiedzi bez przełączania ekranów. */
export function TicketClientAside({ context, userId, email }: { context: TicketContext | null; userId: string; email: string }) {
  if (!context) {
    return (
      <Karta>
        <p className="p-4 text-[13.5px] text-muted-foreground">
          Nie udało się wczytać podglądu klienta. Pełne dane są w <Link href={`/crm/${userId}`}>karcie klienta</Link>.
        </p>
      </Karta>
    );
  }
  const c = context;
  const nazwa = c.client.company ?? c.client.name ?? c.client.email;
  return (
    <>
      <Karta>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-verris-green font-bold text-verris-paper">{inicjaly(nazwa)}</span>
            <div className="flex min-w-0 flex-col">
              <h2 className="font-display text-base font-bold">{nazwa}</h2>
              <span className="text-[12.5px] text-muted-foreground">
                {c.client.company && c.client.name ? `${c.client.name} · ` : ""}klient od {dzien(c.client.since)} · {c.services.length} usł.
              </span>
            </div>
          </div>
          <div className="flex justify-between text-[13.5px]">
            <span className="text-muted-foreground">Saldo</span>
            <span className="font-mono">{c.client.walletBalance != null ? `${c.client.walletBalance} K` : "—"}</span>
          </div>
          <div className="flex justify-between text-[13.5px]">
            <span className="text-muted-foreground">Kondycja</span>
            <span className={`font-semibold ${ton(c.healthScore)}`}>{c.healthScore != null ? `${c.healthScore} / 100` : "—"}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={`/crm/${userId}`} className="inline-flex h-8 items-center rounded-[9px] border border-line-strong bg-card px-3 text-[13px] font-semibold text-foreground no-underline hover:border-primary">
              Karta klienta
            </Link>
            <StaffImpersonateButton userId={userId} email={email} />
          </div>
        </div>
      </Karta>

      <Karta tytul={`Usługi (${c.services.length})`} id="usl">
        {c.services.length === 0 ? <Wiersz><span className="text-[13.5px] text-muted-foreground">Brak usług.</span></Wiersz> : null}
        {c.services.map((s) => (
          <Wiersz key={s.id}>
            <span className="flex min-w-0 flex-1 flex-col">
              <Link href={`/crm/${userId}/subscriptions/${s.id}`} className="text-sm font-semibold text-foreground no-underline hover:text-data-hi">
                {s.domain ?? s.plan ?? "Usługa"}
              </Link>
              {s.siteStatus === "DOWN" ? (
                <span className="text-[12.5px] text-crit">strona nie odpowiada</span>
              ) : (
                <span className="text-[12.5px] text-muted-foreground">
                  {s.plan ?? "—"} · {SUB_STATUS[s.status] ?? s.status} · SSL do {dzien(s.sslExpiresAt)}
                </span>
              )}
              <span className="text-[12px] text-muted-foreground">
                kondycja <span className={ton(s.healthScore)}>{s.healthScore ?? "—"}</span> · okres do {dzien(s.currentPeriodEnd)}
              </span>
            </span>
          </Wiersz>
        ))}
      </Karta>

      <Karta tytul="Ostatnie zdarzenia usług" id="zd">
        {c.events.length === 0 ? <Wiersz><span className="text-[13.5px] text-muted-foreground">Brak.</span></Wiersz> : null}
        {c.events.map((e, i) => (
          <Wiersz key={i}>
            <span className="w-[76px] shrink-0 font-mono text-[12px] text-muted-foreground">{dzienGodz(e.createdAt)}</span>
            <span className="text-[13.5px]">
              {etykieta(SERVICE_EVENT_PL, e.type)}
              {e.domain ? <span className="text-muted-foreground"> · {e.domain}</span> : null}
            </span>
          </Wiersz>
        ))}
      </Karta>

      <Karta tytul="Dokumenty rozliczeniowe" id="dok">
        {c.invoices.length === 0 ? <Wiersz><span className="text-[13.5px] text-muted-foreground">Brak.</span></Wiersz> : null}
        {c.invoices.map((i) => (
          <Wiersz key={i.id}>
            <span className="flex-1 text-[13.5px]">{i.number}</span>
            <span className={`text-[13px] ${i.status === "OPEN" ? "text-warn" : "text-muted-foreground"}`}>
              {i.amount} {i.currency} · {INV_STATUS[i.status] ?? i.status}
            </span>
          </Wiersz>
        ))}
      </Karta>

      <Karta tytul="Poprzednie zgłoszenia" id="pz">
        {c.tickets.length === 0 ? <Wiersz><span className="text-[13.5px] text-muted-foreground">To pierwsze zgłoszenie.</span></Wiersz> : null}
        {c.tickets.map((t) => (
          <Wiersz key={t.id}>
            <span className="text-[13.5px]">
              <Link href={`/tickets/${t.id}`}>{t.subject}</Link>
              <span className="text-muted-foreground"> · {TICKET_STATUS[t.status] ?? t.status} · {dzien(t.createdAt)}</span>
            </span>
          </Wiersz>
        ))}
      </Karta>
    </>
  );
}
