import { AuditService } from '../../src/common/audit/audit.service';
import { TicketsService } from '../../src/tickets/tickets.service';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service';
import { prisma, rozlacz, wyczyscBaze } from './setup';

/**
 * PB-37 — klient nigdy nie zgaduje, czy wiadomość do nas trafiła; agent ma gotowy szkic.
 * Na prawdziwej bazie: potwierdzenie z opiekunem, „zajmuje się” przy pierwszym otwarciu,
 * „wciąż pracujemy” po połowie SLA (raz na dobę), podziękowanie z oceną, ponowne otwarcie.
 */
const maile: { tag?: string; to: string }[] = [];
const dzwonki: { userId: string; title: string }[] = [];

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async (m: { tag?: string; to: string }) => void maile.push(m) };
  const config = { get: (k: string) => (k === 'clientPanelUrl' ? 'https://panel.test' : undefined) };
  const notifications = { create: async (n: { userId: string; title: string }) => void dzwonki.push(n) };
  const ai = { supportSuggestion: async () => ({ szkic: 'Dzień dobry, sprawdzam logi.', checklista: ['log'] }) };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, ai as never);
  const tickets = new TicketsService(p, mailer as never, config as never, null as never, audit, notifications as never, opieka);
  return { opieka, tickets };
}

async function ludzie() {
  const s = Date.now();
  const agent = await prisma().user.create({
    data: { email: `ag-${s}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', firstName: 'Anna', lastName: 'Kaczmarek' },
  });
  const klient = await prisma().user.create({
    data: { email: `kl-${s}@test.verris.pl`, passwordHash: 'x', firstName: 'Ola' },
  });
  return { agent, klient };
}

const auto = (ticketId: string) =>
  prisma().ticketReply.findMany({ where: { ticketId, automatic: { not: null } }, orderBy: { createdAt: 'asc' } });

describe('PB-37 — opieka nad zgłoszeniem', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    maile.length = 0;
    dzwonki.length = 0;
  });
  afterAll(rozlacz);

  it('utworzenie: potwierdzenie z opiekunem i terminem, bez „odpowiedzi” w SLA; szkic asystenta gotowy', async () => {
    const { tickets, opieka } = uslugi();
    const { agent, klient } = await ludzie();
    const t = await tickets.create(klient.id, { subject: 'Strona nie działa', message: 'Biały ekran', priority: 'HIGH' } as never);
    const [potw] = await auto(t.id);
    expect(potw.automatic).toBe('POTWIERDZENIE');
    expect(potw.message).toContain('Anna K.');
    expect(potw.message).toMatch(/najpóźniej (dziś|\d\d\.\d\d) do \d\d:\d\d/);
    expect(maile.map((m) => m.tag)).toContain('ticket.auto');
    expect(maile.map((m) => m.tag)).not.toContain('ticket.created');
    const row = await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.assignedToId).toBe(agent.id);
    expect(row.firstResponseAt).toBeNull();
    expect(row.lastReplyIsStaff).toBe(false);

    await opieka.przygotujSzkic(t.id);
    expect(JSON.parse((await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).aiDraft!)).toMatchObject({ szkic: expect.any(String) });

    // widok klienta: opiekun tak, notatki obsługi nie
    const widok = (await tickets.findOne(t.id, klient.id)) as Record<string, unknown>;
    expect(widok.opiekun).toBe('Anna K.');
    expect(widok).not.toHaveProperty('aiDraft');
    expect(widok).not.toHaveProperty('riskReason');
  });

  it('pierwsze otwarcie przez opiekuna: „przeczytane” + „zajmuje się” raz; inna osoba nic nie zmienia', async () => {
    const { tickets } = uslugi();
    const { agent, klient } = await ludzie();
    const t = await tickets.create(klient.id, { subject: 'Poczta', message: 'Nie dochodzi' } as never);
    const inny = await prisma().user.create({ data: { email: `in-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    await tickets.adminFindOne(t.id, inny.id);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).staffReadAt).toBeNull();
    await tickets.adminFindOne(t.id, agent.id);
    await tickets.adminFindOne(t.id, agent.id);
    expect((await auto(t.id)).map((r) => r.automatic)).toEqual(['POTWIERDZENIE', 'ZAJMUJE_SIE']);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).staffReadAt).not.toBeNull();
  });

  it('„wciąż pracujemy” po połowie SLA, najwyżej raz na dobę, z przypomnieniem dla opiekuna', async () => {
    const { tickets, opieka } = uslugi();
    const { agent, klient } = await ludzie();
    const t = await tickets.create(klient.id, { subject: 'Pilne', message: 'Sklep leży', priority: 'URGENT' } as never);
    const temu = new Date(Date.now() - 40 * 60_000);
    await prisma().ticket.update({ where: { id: t.id }, data: { createdAt: temu, lastReplyAt: temu } });
    expect(await opieka.wciazPracujemy()).toBe(1);
    expect(await opieka.wciazPracujemy()).toBe(0);
    expect((await auto(t.id)).map((r) => r.automatic)).toContain('WCIAZ_PRACUJEMY');
    expect(dzwonki.some((d) => d.userId === agent.id && d.title === 'Klient czeka na odpowiedź')).toBe(true);

    // odpowiedź człowieka zatrzymuje licznik
    const t2 = await tickets.create(klient.id, { subject: 'Inne', message: 'x', priority: 'URGENT' } as never);
    await tickets.adminAddReply(t2.id, agent.id, { message: 'Już patrzę' });
    await prisma().ticket.update({ where: { id: t2.id }, data: { createdAt: temu, lastReplyAt: temu, status: 'IN_PROGRESS' } });
    expect(await opieka.wciazPracujemy()).toBe(0);

    // zgłoszenie sprzed SUP-V2 (nie wiadomo, kto pisał ostatni) — bez automatycznej wiadomości
    const t3 = await tickets.create(klient.id, { subject: 'Stare', message: 'x', priority: 'URGENT' } as never);
    await prisma().ticket.update({ where: { id: t3.id }, data: { createdAt: temu, lastReplyAt: temu, lastReplyIsStaff: null } });
    expect(await opieka.wciazPracujemy()).toBe(0);
  });

  it('zamknięcie: podziękowanie z oceną zamiast maila o stanie; ocena opiekuna + supportu; ponowne otwarcie do 7 dni', async () => {
    const { tickets, opieka } = uslugi();
    const { agent, klient } = await ludzie();
    const t = await tickets.create(klient.id, { subject: 'SSL', message: 'Brak kłódki' } as never);
    maile.length = 0;
    await tickets.adminUpdateTicket(t.id, { status: 'CLOSED' } as never, agent.id);
    expect((await auto(t.id)).map((r) => r.automatic)).toContain('PODZIEKOWANIE');
    expect(maile.map((m) => m.tag)).toEqual(['ticket.auto']);

    await tickets.submitCsat(t.id, klient.id, 4, 'ok', { agentRating: 5, resolved: true });
    const [o] = await opieka.ocenyAgentow(30);
    expect(o).toMatchObject({ agentId: agent.id, nazwa: 'Anna Kaczmarek', ocen: 1, opiekun: 5, support: 4, rozwiazanePct: 100 });
    expect(await opieka.ocenyAgentow(30, klient.id)).toEqual([]);

    await opieka.otworzPonownie(t.id, klient.id);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('OPEN');
    await prisma().ticket.update({ where: { id: t.id }, data: { status: 'CLOSED', resolvedAt: new Date(Date.now() - 8 * 86400_000) } });
    await expect(opieka.otworzPonownie(t.id, klient.id)).rejects.toThrow(/7 dni/);
  });

  it('treści z panelu: wyłączone potwierdzenie → dotychczasowy e-mail; nieznana zmienna odrzucona', async () => {
    const { tickets, opieka } = uslugi();
    const { agent, klient } = await ludzie();
    await opieka.zapiszUstawienia({ POTWIERDZENIE: { wlaczone: false, tresc: 'Mamy to: #{{nr}}, {{opiekun}}.' } }, agent.id);
    const t = await tickets.create(klient.id, { subject: 'DNS', message: 'x' } as never);
    expect(await auto(t.id)).toEqual([]);
    expect(maile.map((m) => m.tag)).toContain('ticket.created');
    await expect(
      opieka.zapiszUstawienia({ ZAJMUJE_SIE: { wlaczone: true, tresc: 'Cześć {{haslo}}, pracujemy.' } }, agent.id),
    ).rejects.toThrow(/Nieznane zmienne/);
    const w = await opieka.widokUstawien();
    expect(w.wiadomosci.find((x) => x.rodzaj === 'POTWIERDZENIE')).toMatchObject({ wlaczone: false, tresc: 'Mamy to: #{{nr}}, {{opiekun}}.' });
  });
});
