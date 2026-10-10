import { AuditService } from '../../src/common/audit/audit.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { AiService } from '../../src/ai/ai.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * F2.5 — notatka wewnętrzna w wątku zgłoszenia NIE MOŻE WYCIEC. Na prawdziwej bazie sprawdzamy każdą ścieżkę
 * do klienta: widok zgłoszenia i lista w API klienta, pobranie załącznika, maile (powiadomienia i auto-wiadomości)
 * oraz kontekst szkicu asystenta. Notatka nie zmienia też stanu ani „kto pisał ostatni” (od tego zależą
 * auto-wiadomości i SLA).
 */
const NOTATKA = 'NOTATKA-WEWNETRZNA: klient to były pracownik konkurencji, nie dawać rabatu';
const maile: unknown[] = [];
const promptyAi: string[] = [];

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async (m: unknown) => void maile.push(m) };
  const config = { get: (k: string) => (k === 'clientPanelUrl' ? 'https://panel.test' : undefined) };
  const notifications = { create: async () => undefined };
  const provider = {
    kontoPozaTestemAi: async () => null,
    complete: async (i: { system: string; user: string }) => {
      promptyAi.push(i.user);
      return { wynik: { szkic: 'Dzień dobry', checklista: [] }, dostawca: 'test', model: 'test', wej: 1, wyj: 1, kosztUsd: 0 };
    },
    opis: async () => ({ dostawca: 'test', model: 'test' }),
  };
  const ai = new AiService(p, provider as never, audit);
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, ai as never);
  const tickets = new TicketsService(p, mailer as never, config as never, null as never, audit, notifications as never, opieka);
  return { tickets, opieka, ai };
}

async function ludzie() {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const agent = await prisma().user.create({
    data: { email: `ag-${s}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', firstName: 'Anna', lastName: 'Kaczmarek' },
  });
  const klient = await prisma().user.create({ data: { email: `kl-${s}@test.verris.pl`, passwordHash: 'x', firstName: 'Ola' } });
  return { agent, klient };
}

describe('F2.5 — notatki wewnętrzne w wątku zgłoszenia', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    maile.length = 0;
    promptyAi.length = 0;
  });
  afterAll(rozlacz);

  it('notatka: bez maila, bez zmiany stanu i „ostatniej wiadomości”; obsługa ją widzi, klient nie', async () => {
    const { tickets } = uslugi();
    const { agent, klient } = await ludzie();
    const t = await tickets.create(klient.id, { subject: 'Strona nie działa', message: 'Od rana błąd 500.' });
    await tickets.adminAddReply(t.id, agent.id, { message: 'Sprawdzamy logi, wrócimy w ciągu godziny.', czekaj: 'nie' });
    const przed = await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    const mailiPrzed = maile.length;

    await tickets.adminAddNote(t.id, agent.id, NOTATKA);

    const po = await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(po).toMatchObject({
      status: przed.status,
      lastReplyAt: przed.lastReplyAt,
      lastReplyIsStaff: przed.lastReplyIsStaff,
      waitingSince: przed.waitingSince,
      firstResponseAt: przed.firstResponseAt,
    });
    expect(maile.length).toBe(mailiPrzed);
    const ev = await prisma().ticketEvent.findFirstOrThrow({ where: { ticketId: t.id, type: 'INTERNAL_NOTE' } });
    expect(ev.actorId).toBe(agent.id);

    const obsluga = await tickets.adminFindOne(t.id);
    expect(obsluga.replies.find((r) => r.message === NOTATKA)).toMatchObject({ internal: true, isStaff: true, authorId: agent.id });

    // API klienta: widok zgłoszenia (cała odpowiedź) i lista z licznikiem wiadomości.
    const widok = await tickets.findOne(t.id, klient.id);
    expect(JSON.stringify(widok)).not.toContain('NOTATKA-WEWNETRZNA');
    expect(widok.replies.some((r) => 'internal' in r)).toBe(false);
    expect(widok.replies.some((r) => r.message.includes('Sprawdzamy logi'))).toBe(true);
    const lista = await tickets.findAllByUser(klient.id);
    const wszystkie = await prisma().ticketReply.count({ where: { ticketId: t.id } });
    expect(lista[0]!._count.replies).toBe(wszystkie - 1);
  });

  it('załącznik doklejony do notatki: klient go nie widzi i nie pobierze, obsługa tak', async () => {
    const { tickets } = uslugi();
    const { agent, klient } = await ludzie();
    const t = await tickets.create(klient.id, { subject: 'Poczta', message: 'Nie dochodzą maile.' });
    const n = await tickets.adminAddNote(t.id, agent.id, NOTATKA);
    // Notatki z panelu są bez plików — rekord wstawiony wprost sprawdza filtr na zapas.
    const att = await prisma().ticketAttachment.create({
      data: { ticketId: t.id, replyId: n.id, uploadedById: agent.id, originalName: 'wewn.txt', mimeType: 'text/plain', sizeBytes: 3, storageKey: `k-${n.id}` },
    });
    const widok = await tickets.findOne(t.id, klient.id);
    expect(widok.attachments.map((a) => a.id)).not.toContain(att.id);
    await expect(tickets.getAttachmentForDownload(t.id, att.id, klient.id, 'USER')).rejects.toThrow(/nie został znaleziony/);
    expect((await tickets.getAttachmentForDownload(t.id, att.id, 'admin', 'ADMIN')).id).toBe(att.id);
  });

  it('auto-wiadomości i powiadomienia po notatce nie niosą jej treści', async () => {
    const { tickets, opieka } = uslugi();
    const { agent, klient } = await ludzie();
    const t = await tickets.create(klient.id, { subject: 'Domena', message: 'Domena nie odpowiada.' });
    await tickets.adminAddNote(t.id, agent.id, NOTATKA);
    await tickets.adminUpdateTicket(t.id, { status: 'IN_PROGRESS' }, agent.id);
    await tickets.adminAddReply(t.id, agent.id, { message: 'Domena wygasła u rejestratora — odnawiamy.' });
    await tickets.adminUpdateTicket(t.id, { status: 'CLOSED' }, agent.id);
    await opieka.wyslij(t.id, 'WCIAZ_PRACUJEMY');
    expect(maile.length).toBeGreaterThan(0);
    expect(JSON.stringify(maile)).not.toContain('NOTATKA-WEWNETRZNA');
    const automatyczne = await prisma().ticketReply.findMany({ where: { ticketId: t.id, automatic: { not: null } } });
    expect(automatyczne.every((r) => !r.internal && !r.message.includes('NOTATKA-WEWNETRZNA'))).toBe(true);
  });

  it('szkic asystenta (ręczny i w tle) nie dostaje notatki w kontekście', async () => {
    const { tickets, ai } = uslugi();
    const { agent, klient } = await ludzie();
    const t = await tickets.create(klient.id, { subject: 'SSL', message: 'Certyfikat wygasł.' });
    await tickets.adminAddNote(t.id, agent.id, NOTATKA);
    await tickets.addReply(t.id, klient.id, { message: 'Dalej nie działa, proszę o pomoc.' });
    await ai.supportSuggestion(t.id, agent.id);
    // przygotujSzkic po wiadomości klienta działa w tle — dajmy mu chwilę.
    await new Promise((r) => setTimeout(r, 300));
    expect(promptyAi.length).toBeGreaterThanOrEqual(1);
    expect(promptyAi.join('\n')).not.toContain('NOTATKA-WEWNETRZNA');
    expect(promptyAi.join('\n')).toContain('Dalej nie działa');
  });

  it('zła notatka (pusta) → 400; nieistniejące zgłoszenie → 404', async () => {
    const { tickets } = uslugi();
    const { agent, klient } = await ludzie();
    const t = await tickets.create(klient.id, { subject: 'Test', message: 'Treść zgłoszenia.' });
    await expect(tickets.adminAddNote(t.id, agent.id, '  ')).rejects.toThrow(/za krótka/);
    await expect(tickets.adminAddNote('00000000-0000-0000-0000-000000000000', agent.id, 'Notatka')).rejects.toThrow(/Nie znaleziono/);
  });
});
