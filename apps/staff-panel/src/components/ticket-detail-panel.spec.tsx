import { renderToStaticMarkup } from "react-dom/server";

/**
 * X-05 — kluczowy ekran obsługi: szczegół zgłoszenia (PB-37). Terminy SLA, „Co widzi klient”,
 * zapowiedź „Wciąż nad tym pracujemy” i szkic asystenta z tła — to, na czym opiekun działa.
 */
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
jest.mock("@/lib/ticket-actions", () => ({
  staffApplyRunbook: jest.fn(),
  staffEscalateTicket: jest.fn(),
  staffFetchCanned: jest.fn(async () => []),
  staffGenerateAiSuggestion: jest.fn(),
  staffGetAiStatus: jest.fn(async () => ({ configured: false })),
  staffPostReplyWithFiles: jest.fn(),
  staffSetRiskFlag: jest.fn(),
  staffUpdateTicket: jest.fn(),
  staffLinkTicketService: jest.fn(),
  staffTicketDiagnostics: jest.fn(),
  staffUndoEscalation: jest.fn(),
  staffSetTags: jest.fn(),
  staffListTags: jest.fn(async () => []),
  staffRunbookSteps: jest.fn(),
  staffApplyMacro: jest.fn(),
  staffMergeTicket: jest.fn(),
  staffPresence: jest.fn(async () => []),
  staffLeave: jest.fn(),
}));
jest.mock("@/lib/wnioski-actions", () => ({ zlozWniosekAction: jest.fn() }));

import { TicketDetailPanel } from "./ticket-detail-panel";
import type { StaffTicketDetail } from "@/lib/tickets-data";

const TERAZ = Date.parse("2026-09-26T10:00:00Z");
const h = (n: number) => new Date(TERAZ + n * 3_600_000).toISOString();
const tekst = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function zgl(zmiany: Partial<StaffTicketDetail> = {}): StaffTicketDetail {
  return {
    id: "t1000000-0000-4000-8000-000000000001",
    subject: "Strona nie działa",
    message: "Po aktualizacji biała strona.",
    status: "OPEN",
    priority: "NORMAL",
    department: "TECHNICAL",
    createdAt: h(-2),
    user: { id: "u1", firstName: "Anna", lastName: "Nowak", email: "anna@test.pl", companyName: null },
    assignedTo: { id: "s1", firstName: "Piotr", lastName: "Kowal" },
    assignedToId: "s1",
    slaResponseDueAt: h(-1),
    lastReplyIsStaff: false,
    lastReplyAt: h(-2),
    _count: { replies: 0 },
    replies: [],
    ...zmiany,
  } as StaffTicketDetail;
}

const render = (t: StaffTicketDetail) =>
  tekst(renderToStaticMarkup(<TicketDetailPanel ticket={t} agents={[]} context={null} mojeOceny={null} teraz={TERAZ} />));

describe("F2.5 — notatki wewnętrzne w wątku", () => {
  it("notatka wyróżniona i opisana „klient jej nie widzi”; przycisk „Zapisz jako notatkę”", () => {
    const html = renderToStaticMarkup(
      <TicketDetailPanel
        ticket={zgl({ replies: [{ id: "r1", message: "Klient VIP — nie zamykać bez telefonu.", createdAt: h(-1), isStaff: true, internal: true, authorId: "s1" }] })}
        agents={[{ id: "s1", email: "p@verris.pl", firstName: "Piotr", lastName: "Kowal" }]}
        context={null}
        mojeOceny={null}
        teraz={TERAZ}
      />,
    );
    expect(html).toContain('data-wpis="notatka"');
    expect(tekst(html)).toContain("Notatka wewnętrzna · Piotr");
    expect(tekst(html)).toContain("klient jej nie widzi");
    expect(tekst(html)).toContain("Zapisz jako notatkę");
  });
});

describe("F2.5 — tagi, eskalacja z cofnięciem, zdejmowana flaga ryzyka, kroki runbooka", () => {
  it("bez eskalacji i flagi: „Eskaluj” i „Oznacz ryzyko” (wymagają powodu); tagi z listą", () => {
    const html = renderToStaticMarkup(<TicketDetailPanel ticket={zgl({ tags: ["vip", "poczta"] })} agents={[]} context={null} mojeOceny={null} teraz={TERAZ} />);
    const t = tekst(html);
    expect(html).toContain('data-karta="tagi"');
    expect(t).toMatch(/vip .*poczta/);
    expect(t).toContain("Eskaluj");
    expect(t).not.toContain("Cofnij eskalację");
    expect(t).toContain("Oznacz ryzyko");
    expect(t).toContain("Powód (trafi do dziennika)");
    // pusty powód → przyciski wyłączone
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Eskaluj<\/button>/);
    expect(t).toContain("Zapisz kroki w wątku");
  });

  it("eskalowane i z flagą: „Cofnij eskalację” i „Zdejmij flagę ryzyka”", () => {
    const t = render(zgl({ escalatedAt: h(-1), escalationReason: "Potrzebny L3", riskFlag: "SUPPORT_RISK", riskReason: "Grozi odejściem" }));
    expect(t).toContain("Cofnij eskalację");
    expect(t).toContain("Zdejmij flagę ryzyka");
    expect(t).toContain("Potrzebny L3");
    expect(t).toContain("ryzyko: Grozi odejściem");
    expect(t).not.toMatch(/>\s*Eskaluj\s*</);
  });
});

describe("X-05 szczegół zgłoszenia (obsługa)", () => {
  it("bez pierwszej odpowiedzi po terminie: czerwona informacja z czasem spóźnienia", () => {
    expect(render(zgl())).toMatch(/Pierwsza odpowiedź: .*po terminie/);
  });

  it("odpowiedziane: termin pierwszej odpowiedzi dotrzymany, bez alarmu", () => {
    const t = render(zgl({ firstResponseAt: h(-1.5) }));
    expect(t).toContain("Pierwsza odpowiedź: w terminie");
    expect(t).not.toMatch(/Pierwsza odpowiedź: .*po terminie/);
  });

  it("co widzi klient: opiekun z imienia, „przeczytane” tylko po ostatniej wiadomości klienta", () => {
    expect(render(zgl({ staffReadAt: h(-1) }))).toContain("Opiekun: Piotr K.");
    expect(render(zgl({ staffReadAt: h(-1) }))).toContain("Przeczytane");
    // Klient dopisał się po otwarciu przez opiekuna — znów nieprzeczytane.
    const poDopisku = zgl({
      staffReadAt: h(-1),
      replies: [{ id: "r1", message: "Dalej nie działa", createdAt: h(-0.5), isStaff: false }],
    });
    expect(render(poDopisku)).toContain("Jeszcze nieprzeczytane przez opiekuna");
  });

  it("czeka na nas: zapowiedź „Wciąż nad tym pracujemy” (po połowie czasu odpowiedzi)", () => {
    const t = render(zgl({ lastReplyAt: h(-1) }));
    expect(t).toContain("Czeka na naszą odpowiedź");
    expect(t).toContain("Wciąż nad tym pracujemy");
  });

  it("czekamy na klienta: bez zapowiedzi, za to cykl przypomnienia i zamknięcia", () => {
    const t = render(zgl({ status: "WAITING_CUSTOMER", lastReplyIsStaff: true, waitingSince: h(-3) }));
    expect(t).toContain("Czekamy na odpowiedź klienta");
    expect(t).not.toContain("Wciąż nad tym pracujemy");
    expect(t).toContain("zamknięcie po 5 dniach bez odpowiedzi");
  });

  it("PB-43: przy rozmowie usługa zgłoszenia z diagnostyką i runbook z krokami", () => {
    const t = render(zgl({ subscription: { id: "sub1", serviceTag: null, status: "ACTIVE", plan: { name: "Hosting" }, account: { domain: "sklep.pl" } } }));
    expect(t).toContain("Usługa zgłoszenia");
    expect(t).toContain("sklep.pl");
    expect(t).toContain("Diagnostyka");
    expect(t).toContain("Runbook");
    expect(t).not.toContain("Lista kontrolna");
  });

  it("zamknięte z oceną: oceny opiekuna i obsługi widoczne", () => {
    const t = render(zgl({ status: "CLOSED", csatAt: h(-0.2), agentRating: 5, csatRating: 4, csatResolved: true }));
    expect(t).toContain("Opiekun: 5/5");
    expect(t).toContain("obsługa: 4/5");
    expect(t).toContain("Problem rozwiązany: tak");
  });
});

describe("F3.7 — makra, scalanie, obecność", () => {
  const makro = { id: "m1", title: "Rozwiązane — DNS", content: "Dzień dobry Anno, poprawione.", makroStan: "CLOSED", makroTagi: ["dns"], makroPrzypisz: "JA" };
  const kandydat = { id: "t2000000-0000-4000-8000-000000000002", subject: "Drugie zgłoszenie", status: "OPEN", createdAt: h(-5) };
  const html = (t: StaffTicketDetail, o: { makra?: typeof makro[] | null; mozeScalic?: boolean } = {}) =>
    renderToStaticMarkup(
      <TicketDetailPanel ticket={t} agents={[]} context={null} mojeOceny={null} teraz={TERAZ} makra={o.makra === undefined ? [makro] : o.makra} kandydaciScalenia={[kandydat]} mozeScalic={o.mozeScalic ?? false} />,
    );

  it("makra: nazwa i co zrobią (odpowiedź, stan, tagi, przypisanie); błąd wczytania mówi to wprost", () => {
    const t = tekst(html(zgl()));
    expect(t).toContain("Rozwiązane — DNS");
    expect(t).toContain("odpowiedź · stan: zamknięte · tagi: dns · przypisz do mnie");
    expect(tekst(html(zgl(), { makra: null }))).toContain("Nie udało się wczytać makr");
  });

  it("scalanie: L1/L2 — „Wyślij wniosek” TICKET_MERGE; L3 — powód, „rozumiem” i „Scal zgłoszenia”", () => {
    const bez = html(zgl());
    expect(bez).toContain('data-karta="scalanie"');
    expect(bez).toContain('data-wniosek="TICKET_MERGE"');
    expect(tekst(bez)).not.toContain("Scal zgłoszenia");
    const l3 = tekst(html(zgl(), { mozeScalic: true }));
    expect(l3).toContain("Rozumiem — scalenia nie da się cofnąć");
    expect(l3).toContain("Scal zgłoszenia");
    expect(l3).toContain("#t2000000 · Drugie zgłoszenie");
  });

  it("zgłoszenie scalone: baner z numerem celu, bez scalania, makra zablokowane; historia scalenia z powodem", () => {
    const t = zgl({
      scalonoDoId: "t3000000-0000-4000-8000-000000000003",
      events: [{ id: "e1", type: "MERGED_INTO", actorId: "s1", meta: { cel: "t3000000-0000-4000-8000-000000000003", reason: "duplikat z maila" }, createdAt: h(-1) }],
    });
    const out = html(t);
    expect(out).toContain("data-scalone");
    expect(tekst(out)).toContain("Scalone z #t3000000 — rozmowa toczy się tam.");
    expect(out).not.toContain('data-karta="scalanie"');
    expect(tekst(out)).toContain("Zgłoszenie scalone — makra stosuj w docelowym.");
    expect(tekst(out)).toContain("Scalone z innym zgłoszeniem #t3000000 — duplikat z maila");
  });
});
