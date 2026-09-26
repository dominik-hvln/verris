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
}));

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
    expect(render(poDopisku)).toContain("Jeszcze nie przeczytane przez opiekuna");
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

  it("zamknięte z oceną: oceny opiekuna i obsługi widoczne", () => {
    const t = render(zgl({ status: "CLOSED", csatAt: h(-0.2), agentRating: 5, csatRating: 4, csatResolved: true }));
    expect(t).toContain("Opiekun: 5/5");
    expect(t).toContain("obsługa: 4/5");
    expect(t).toContain("Problem rozwiązany: tak");
  });
});
