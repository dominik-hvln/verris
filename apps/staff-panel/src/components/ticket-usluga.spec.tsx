import { renderToStaticMarkup } from "react-dom/server";

/** PB-43 — usługa zgłoszenia przy rozmowie (diagnostyka, karta usługi, zmiana) i runbooki. */
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
jest.mock("@/lib/ticket-actions", () => ({ staffApplyRunbook: jest.fn(), staffLinkTicketService: jest.fn(), staffTicketDiagnostics: jest.fn() }));

import { TicketUsluga, nazwaUslugiZgloszenia } from "./ticket-usluga";
import { TicketRunbook } from "./ticket-runbook";

const tekst = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const usluga = { id: "s1", serviceTag: "wnbgswgc", status: "ACTIVE", plan: { name: "Hosting" }, account: { domain: "sklep.pl" } };
const uslugiKlienta = [
  { id: "s1", plan: "Hosting", status: "ACTIVE", domain: "sklep.pl", healthScore: 90, siteStatus: "UP", sslExpiresAt: null, currentPeriodEnd: null },
  { id: "s2", plan: "Poczta", status: "ACTIVE", domain: null, healthScore: null, siteStatus: null, sslExpiresAt: null, currentPeriodEnd: null },
];

describe("TicketUsluga", () => {
  it("powiązana usługa: nazwa, stan, „Diagnostyka” i link do karty usługi", () => {
    const html = renderToStaticMarkup(<TicketUsluga ticketId="t1" userId="u1" usluga={usluga} uslugiKlienta={uslugiKlienta} />);
    const t = tekst(html);
    expect(t).toContain("sklep.pl (wnbgswgc)");
    expect(t).toContain("Hosting · aktywna");
    expect(t).toContain("Diagnostyka");
    expect(html).toContain('href="/crm/u1/subscriptions/s1"');
    expect(t).toContain("Zmień:");
  });

  it("bez usługi: mówi to wprost, bez diagnostyki, z wyborem usługi", () => {
    const t = tekst(renderToStaticMarkup(<TicketUsluga ticketId="t1" userId="u1" usluga={null} uslugiKlienta={uslugiKlienta} />));
    expect(t).toContain("Zgłoszenie nie jest powiązane z usługą.");
    expect(t).not.toContain("Diagnostyka");
    expect(t).toContain("Wskaż:");
  });

  it("podgląd klienta się nie wczytał: komunikat zamiast pustego wyboru", () => {
    const t = tekst(renderToStaticMarkup(<TicketUsluga ticketId="t1" userId="u1" usluga={usluga} uslugiKlienta={null} />));
    expect(t).toContain("Lista usług klienta niedostępna");
  });

  it("nazwa usługi z obu kształtów (zgłoszenie i podgląd klienta)", () => {
    expect(nazwaUslugiZgloszenia(usluga)).toBe("sklep.pl (wnbgswgc)");
    expect(nazwaUslugiZgloszenia(uslugiKlienta[1])).toBe("Poczta");
  });
});

describe("TicketRunbook", () => {
  const r = (p: Partial<Parameters<typeof TicketRunbook>[0]>) =>
    tekst(renderToStaticMarkup(<TicketRunbook ticketId="t1" runbookKey={null} kategoria="INNE" dzial="TECHNICAL" {...p} />));

  it.each([
    ["AWARIA", "Strona nie działa (5xx / timeout)", "Limity zasobów konta"],
    ["POCZTA", "Poczta nie przychodzi / nie wychodzi", "MX, SPF, DKIM, DMARC"],
    ["SSL", "Certyfikat SSL / ostrzeżenie przeglądarki", "Mieszana treść"],
    ["MIGRACJA", "Migracja zatrzymana", "kokpicie migracji"],
  ])("kategoria %s → zalecany runbook z krokami", (kategoria, nazwa, krok) => {
    const t = r({ kategoria });
    expect(t).toContain(nazwa);
    expect(t).toContain("zalecany");
    expect(t).toContain(krok);
    expect(t).toContain("Zapisz przy zgłoszeniu");
  });

  it("zapisany przy zgłoszeniu: pokazuje go, bez przycisku zapisu", () => {
    const t = r({ runbookKey: "ssl", kategoria: "POCZTA" });
    expect(t).toContain("Przy zgłoszeniu: Certyfikat SSL / ostrzeżenie przeglądarki");
    expect(t).toContain("Mieszana treść");
    expect(t).not.toContain("Zapisz przy zgłoszeniu");
  });

  it("dział rozliczeń bez kategorii z treści: runbook płatności (jak dotąd)", () => {
    expect(r({ kategoria: null, dzial: "BILLING" })).toContain("Status ostatniej faktury i płatności");
  });
});
