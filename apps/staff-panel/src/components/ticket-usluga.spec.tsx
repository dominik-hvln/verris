import { renderToStaticMarkup } from "react-dom/server";

/** PB-43 — usługa zgłoszenia przy rozmowie (diagnostyka, karta usługi, zmiana) i runbooki. */
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
jest.mock("@/lib/ticket-actions", () => ({ staffApplyRunbook: jest.fn(), staffLinkTicketService: jest.fn(), staffTicketDiagnostics: jest.fn() }));

import { TicketUsluga, nazwaUslugiZgloszenia } from "./ticket-usluga";
import { TicketRunbook } from "./ticket-runbook";
import { domenaDoWyswietlenia } from "@verris/contracts";

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

describe("weryfikacja 12.10 — usługa usuniętego konta bez technicznego przyrostka domeny", () => {
  const SUROWA = "z18b.d3.hvln.pl~usuniete-97c925b0-a215-40bc-9c78-28752e3cc91b";

  it("domenaDoWyswietlenia: „<domena>~usuniete-<uuid>” → „<domena> (usunięta)”, inne wartości bez zmian", () => {
    expect(domenaDoWyswietlenia(SUROWA)).toBe("z18b.d3.hvln.pl (usunięta)");
    expect(domenaDoWyswietlenia("sklep.pl")).toBe("sklep.pl");
    expect(domenaDoWyswietlenia(null)).toBeNull();
    expect(domenaDoWyswietlenia(undefined)).toBeUndefined();
  });

  it("karta „Usługa zgłoszenia”, selektor „Zmień:” i nazwa na osi pokazują „(usunięta)”", () => {
    const usunieta = { ...usluga, serviceTag: null, status: "CANCELED", account: { domain: SUROWA } };
    const lista = [{ ...uslugiKlienta[0], status: "CANCELED", domain: SUROWA }, uslugiKlienta[1]];
    const html = renderToStaticMarkup(<TicketUsluga ticketId="t1" userId="u1" usluga={usunieta} uslugiKlienta={lista} />);
    expect(html).not.toContain("~usuniete");
    expect(html).toContain('<span class="text-sm font-semibold">z18b.d3.hvln.pl (usunięta)</span>');
    expect(tekst(html)).toMatch(/Zmień: .*z18b\.d3\.hvln\.pl \(usunięta\)/);
    expect(nazwaUslugiZgloszenia(lista[0])).toBe("z18b.d3.hvln.pl (usunięta)");
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
