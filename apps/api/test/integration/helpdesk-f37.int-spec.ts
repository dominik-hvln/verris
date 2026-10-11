import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { TicketContextService } from '../../src/tickets/ticket-context.service.js';
import { MakraZgloszenService } from '../../src/tickets/makra-zgloszen.js';
import { RaportyZgloszenService } from '../../src/tickets/raporty-zgloszen.js';
import { PocztaPrzychodzacaService } from '../../src/tickets/poczta/poczta-przychodzaca.service.js';
import { atrapaImap } from '../../src/test/atrapa-imap.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * F3.7 cz. 2 na prawdziwym Postgresie: scalanie zgłoszeń (notatki wewnętrzne nie wyciekają, pliki i maile idą za
 * wątkiem, blokady wierszy przy równoległym scaleniu, mail na stary wątek trafia do celu), makra, akcje masowe,
 * działy w skrzynce i raporty (SLA, CSAT, mediana czasu odpowiedzi osób).
 */
const NOTATKA = 'NOTATKA-WEWNETRZNA: klient grozi odejściem, nie obiecywać rabatu';
const maile: Array<{ to?: string; subject?: string }> = [];

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async (m: (typeof maile)[number]) => void maile.push(m) };
  const config = { get: () => undefined };
  const notifications = { create: async () => undefined };
  const ai = { supportSuggestion: async () => null };
  const storage = { putObject: async () => undefined, removeObject: async () => undefined };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, ai as never);
  const tickets = new TicketsService(p, mailer as never, config as never, storage as never, audit, notifications as never, opieka);
  const makra = new MakraZgloszenService(p, tickets, new TicketContextService(p));
  const poczta = new PocztaPrzychodzacaService(p, tickets, storage as never, audit, config as never);
  return { tickets, opieka, makra, poczta, raporty: new RaportyZgloszenService(p) };
}

async function ludzie() {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const op = await prisma().user.create({ data: { email: `op-${s}@verris.pl`, passwordHash: 'x', role: 'STAFF', firstName: 'Anna', lastName: 'Nowak' } });
  const op2 = await prisma().user.create({ data: { email: `op2-${s}@verris.pl`, passwordHash: 'x', role: 'STAFF', firstName: 'Piotr' } });
  const jan = await prisma().user.create({ data: { email: `jan-${s}@klient.pl`, passwordHash: 'x', firstName: 'Jan' } });
  const ola = await prisma().user.create({ data: { email: `ola-${s}@klient.pl`, passwordHash: 'x', firstName: 'Ola' } });
  return { op, op2, jan, ola };
}

const POWOD = 'Ta sama sprawa — duplikat z maila';

/** Źródło z pełnym wątkiem: plik w pierwszej wiadomości, odpowiedź klienta z plikiem, odpowiedź obsługi i notatka. */
async function zrodlo(klientId: string, opId: string, id?: string) {
  const t = await prisma().ticket.create({
    data: { ...(id ? { id } : {}), userId: klientId, subject: 'Poczta nie działa', message: 'Od rana nie dochodzą maile.', createdAt: new Date(Date.now() - 5 * 3600_000), tags: ['poczta'] },
  });
  await prisma().ticketAttachment.create({ data: { ticketId: t.id, uploadedById: klientId, originalName: 'zrzut.png', mimeType: 'image/png', sizeBytes: 10, storageKey: `${t.id}/zrzut.png` } });
  const r1 = await prisma().ticketReply.create({ data: { ticketId: t.id, authorId: klientId, message: 'Dalej nic.', createdAt: new Date(Date.now() - 4 * 3600_000) } });
  await prisma().ticketAttachment.create({ data: { ticketId: t.id, replyId: r1.id, uploadedById: klientId, originalName: 'log.txt', mimeType: 'text/plain', sizeBytes: 5, storageKey: `${t.id}/log.txt` } });
  await prisma().ticketReply.create({ data: { ticketId: t.id, authorId: opId, isStaff: true, message: 'Sprawdzamy kolejkę.', createdAt: new Date(Date.now() - 3 * 3600_000) } });
  const notatka = await prisma().ticketReply.create({ data: { ticketId: t.id, authorId: opId, isStaff: true, internal: true, message: NOTATKA, createdAt: new Date(Date.now() - 2 * 3600_000) } });
  // plik doklejony do notatki (na zapas — dziś notatki są bez plików) też nie może wyjść do klienta
  await prisma().ticketAttachment.create({ data: { ticketId: t.id, replyId: notatka.id, uploadedById: opId, originalName: 'wewnetrzny.pdf', mimeType: 'application/pdf', sizeBytes: 5, storageKey: `${t.id}/wewnetrzny.pdf` } });
  return t;
}

describe('F3.7 — scalanie zgłoszeń', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().pocztaPrzychodzaca.deleteMany({});
    maile.length = 0;
  });
  afterAll(rozlacz);

  it('wątek, pliki i notatki przechodzą do celu; notatki zostają wewnętrzne i nie wychodzą do klienta; bez maili', async () => {
    const { tickets } = uslugi();
    const { op, jan } = await ludzie();
    const a = await zrodlo(jan.id, op.id);
    const b = await prisma().ticket.create({ data: { userId: jan.id, subject: 'Maile nie dochodzą', message: 'Piszę drugi raz.', tags: ['pilne'] } });
    const odp = await tickets.adminMerge(a.id, b.id, op.id, POWOD);
    expect(odp).toEqual({ celId: b.id, odpowiedzi: 3 });
    expect(maile).toEqual([]);

    const cel = await tickets.adminFindOne(b.id);
    expect(cel.replies.map((r) => [r.message.split('\n')[0], r.isStaff, r.internal])).toEqual([
      [`Ze zgłoszenia #${a.id.slice(0, 8)} „Poczta nie działa”:`, false, false],
      ['Dalej nic.', false, false],
      ['Sprawdzamy kolejkę.', true, false],
      [NOTATKA, true, true],
    ]);
    expect(cel.replies[0]).toMatchObject({ authorId: jan.id, createdAt: a.createdAt });
    expect(cel.tags.sort()).toEqual(['pilne', 'poczta']);
    expect(cel.attachments.map((x) => x.originalName).sort()).toEqual(['log.txt', 'wewnetrzny.pdf', 'zrzut.png']);

    // Klient: w celu widzi przeniesioną rozmowę i swoje pliki, NIE widzi notatki ani jej pliku.
    const widok = await tickets.findOne(b.id, jan.id);
    const json = JSON.stringify(widok);
    expect(json).not.toContain('NOTATKA-WEWNETRZNA');
    expect(json).not.toContain('wewnetrzny.pdf');
    expect(widok.attachments.map((x) => x.originalName).sort()).toEqual(['log.txt', 'zrzut.png']);
    expect(widok.replies.find((r) => r.message.startsWith('Ze zgłoszenia'))!.attachments.map((x) => x.originalName)).toEqual(['zrzut.png']);
    await expect(tickets.getAttachmentForDownload(b.id, cel.attachments.find((x) => x.originalName === 'wewnetrzny.pdf')!.id, jan.id, 'USER')).rejects.toBeTruthy();

    // Źródło: zamknięte, wskazuje cel, klient widzi tylko pierwszą wiadomość i informację o połączeniu.
    const zr = await tickets.findOne(a.id, jan.id);
    expect(zr).toMatchObject({ status: 'CLOSED', scalonoDoId: b.id });
    expect(zr.replies.map((r) => [r.automatic, r.message])).toEqual([['SCALONE', `Połączyliśmy to zgłoszenie z #${b.id.slice(0, 8)} — dalsza rozmowa toczy się tam.`]]);
    expect(zr.replies[0].autor).toBeNull();
    expect(JSON.stringify(zr)).not.toContain('NOTATKA-WEWNETRZNA');

    const ev = await prisma().ticketEvent.findMany({ where: { type: { in: ['MERGED_INTO', 'MERGED_FROM'] } }, orderBy: { type: 'asc' } });
    expect(ev.map((e) => [e.ticketId, e.type, e.actorId])).toEqual([[b.id, 'MERGED_FROM', op.id], [a.id, 'MERGED_INTO', op.id]]);
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'TICKET_MERGED' } });
    expect(wpis).toMatchObject({ userId: jan.id, actorUserId: op.id });
    expect(wpis.details).toMatchObject({ zrodlo: a.id, cel: b.id, reason: POWOD });

    // Do źródła nie da się już pisać (klient, plik, ponowne otwarcie, obsługa) — komunikat z numerem celu.
    const nr = new RegExp(`#${b.id.slice(0, 8)}`);
    await expect(tickets.addReply(a.id, jan.id, { message: 'Halo?' })).rejects.toThrow(nr);
    await expect(uslugi().opieka.otworzPonownie(a.id, jan.id)).rejects.toThrow(nr);
    await expect(tickets.adminAddReply(a.id, op.id, { message: 'Odpowiedź' })).rejects.toThrow(nr);
    expect(maile).toEqual([]);
  });

  it('odmowy: inny klient, to samo zgłoszenie, krótki powód, ponownie, cel scalony — bez żadnych zmian', async () => {
    const { tickets } = uslugi();
    const { op, jan, ola } = await ludzie();
    const a = await zrodlo(jan.id, op.id);
    const b = await prisma().ticket.create({ data: { userId: jan.id, subject: 'B', message: 'b' } });
    const obca = await prisma().ticket.create({ data: { userId: ola.id, subject: 'Ola', message: 'o' } });
    await expect(tickets.adminMerge(a.id, obca.id, op.id, POWOD)).rejects.toThrow(/tego samego klienta/);
    await expect(tickets.adminMerge(a.id, a.id, op.id, POWOD)).rejects.toThrow(BadRequestException);
    await expect(tickets.adminMerge(a.id, b.id, op.id, 'krótko')).rejects.toThrow(/min. 10/);
    await expect(tickets.adminMerge(a.id, '00000000-0000-4000-8000-000000000000', op.id, POWOD)).rejects.toThrow(NotFoundException);
    expect(await prisma().ticketReply.count({ where: { ticketId: a.id } })).toBe(3);
    expect(await prisma().ticketReply.count({ where: { ticketId: obca.id } })).toBe(0);

    const zamkniete = await prisma().ticket.create({ data: { userId: jan.id, subject: 'Stare', message: 's', status: 'CLOSED', resolvedAt: new Date() } });
    await expect(tickets.adminMerge(a.id, zamkniete.id, op.id, POWOD)).rejects.toThrow(/docelowe jest zamknięte/);
    expect((await tickets.adminMergeCandidates(a.id)).map((k) => k.id)).toEqual([b.id]);

    await tickets.adminMerge(a.id, b.id, op.id, POWOD);
    await expect(tickets.adminMerge(a.id, b.id, op.id, POWOD)).rejects.toThrow(ConflictException);
    await expect(tickets.adminMerge(b.id, a.id, op.id, POWOD)).rejects.toThrow(/docelowe jest scalone/);
    expect(await prisma().ticketEvent.count({ where: { type: 'MERGED_INTO' } })).toBe(1);
  });

  it('cel „czeka na klienta”, a klient napisał ostatni w źródle → cel wraca do „otwarte” (nie zamknie się sam)', async () => {
    const { tickets } = uslugi();
    const { op, jan } = await ludzie();
    const a = await prisma().ticket.create({ data: { userId: jan.id, subject: 'A', message: 'a', lastReplyAt: new Date(), lastReplyIsStaff: false } });
    const b = await prisma().ticket.create({
      data: { userId: jan.id, subject: 'B', message: 'b', status: 'WAITING_CUSTOMER', waitingSince: new Date(Date.now() - 3600_000), lastReplyAt: new Date(Date.now() - 3600_000), lastReplyIsStaff: true },
    });
    await tickets.adminMerge(a.id, b.id, op.id, POWOD);
    expect(await prisma().ticket.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ status: 'OPEN', waitingSince: null, lastReplyIsStaff: false });
  });

  it('równolegle A→B i B→A: przechodzi jedno, wątek nie rozpada się na dwa zgłoszenia', async () => {
    const { tickets } = uslugi();
    const { op, jan } = await ludzie();
    const a = await zrodlo(jan.id, op.id);
    const b = await zrodlo(jan.id, op.id);
    const wyniki = await Promise.allSettled([tickets.adminMerge(a.id, b.id, op.id, POWOD), tickets.adminMerge(b.id, a.id, op.id, POWOD)]);
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    const scalone = await prisma().ticket.findMany({ where: { scalonoDoId: { not: null } } });
    expect(scalone).toHaveLength(1);
    const cel = scalone[0]!.scalonoDoId!;
    // 3 + 3 odpowiedzi + kopia pierwszej wiadomości źródła — wszystkie w celu, w źródle tylko informacja „połączyliśmy”
    expect(await prisma().ticketReply.count({ where: { ticketId: cel } })).toBe(7);
    expect(await prisma().ticketReply.count({ where: { ticketId: scalone[0]!.id } })).toBe(1);
    expect(await prisma().ticketAttachment.count({ where: { ticketId: cel } })).toBe(6);
  });

  it('mail klienta na wątek scalonego zgłoszenia (nagłówki z jego numerem) trafia do zgłoszenia docelowego', async () => {
    const { tickets, poczta } = uslugi();
    const { op } = await ludzie();
    const jan = await prisma().user.create({ data: { email: 'jan@klient.pl', passwordHash: 'x' } });
    const ID = '1a2b3c4d-0000-4000-8000-0000000000aa';
    await prisma().ticket.create({ data: { id: ID, userId: jan.id, subject: 'DNS', message: 'x' } });
    const b = await prisma().ticket.create({ data: { userId: jan.id, subject: 'DNS — nowe', message: 'y' } });
    await tickets.adminMerge(ID, b.id, op.id, POWOD);
    const eml = readFileSync(join(import.meta.dirname, '../../src/tickets/poczta/__fixtures__/odpowiedz-gmail.eml'));
    const imap = await atrapaImap({ wiadomosci: new Map([[1, eml]]) });
    try {
      expect(await poczta.pobierz({ host: 'atrapa', port: 993, login: 'zgloszenia@verris.pl', haslo: 'x' }, imap.polacz)).toMatchObject({ nowe: 1, bledy: [] });
    } finally {
      await imap.zamknij();
    }
    const odp = await prisma().ticketReply.findFirstOrThrow({ where: { message: { contains: 'rekordy już zmieniłem' } } });
    expect(odp.ticketId).toBe(b.id);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: ID } })).status).toBe('CLOSED');
  });
});

describe('F3.7 — makra, akcje masowe, działy', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().cannedResponse.deleteMany({});
    maile.length = 0;
  });
  afterAll(rozlacz);

  it('makro: odpowiedź ze zmiennymi + zamknięcie + tag + przypisanie do stosującego, jednym wywołaniem', async () => {
    const { makra, tickets } = uslugi();
    const { op, op2, jan } = await ludzie();
    const t = await tickets.create(jan.id, { subject: 'DNS', message: 'Nie działa domena.' });
    await prisma().ticket.update({ where: { id: t.id }, data: { assignedToId: op2.id } });
    const m = await prisma().cannedResponse.create({
      data: { title: 'Rozwiązane — DNS', content: 'Dzień dobry {{imie}}, rekordy poprawione.', makroStan: 'CLOSED', makroTagi: ['dns'], makroPrzypisz: 'JA' },
    });
    expect((await makra.lista(t.id)).map((x) => [x.title, x.content])).toEqual([['Rozwiązane — DNS', 'Dzień dobry Jan, rekordy poprawione.']]);
    await makra.zastosuj(t.id, m.id, op.id);
    const po = await tickets.adminFindOne(t.id);
    expect(po).toMatchObject({ status: 'CLOSED', assignedToId: op.id, tags: ['dns'] });
    expect(po.firstResponseAt).not.toBeNull();
    expect(po.replies.filter((r) => !r.automatic).map((r) => [r.message, r.isStaff, r.internal])).toEqual([['Dzień dobry Jan, rekordy poprawione.', true, false]]);
    expect(po.events.map((e) => e.type)).toEqual(expect.arrayContaining(['STAFF_REPLY', 'STATUS_CHANGED', 'ASSIGNMENT_CHANGED', 'TAGS_CHANGED', 'MACRO_APPLIED']));

    // szablon bez akcji, wyłączony, nieistniejący — odmowa bez odpowiedzi do klienta
    const zwykly = await prisma().cannedResponse.create({ data: { title: 'Zwykły', content: 'Treść' } });
    const t2 = await tickets.create(jan.id, { subject: 'Inne', message: 'x' });
    await expect(makra.zastosuj(t2.id, zwykly.id, op.id)).rejects.toThrow(/nie ma akcji/);
    await prisma().cannedResponse.update({ where: { id: m.id }, data: { isActive: false } });
    await expect(makra.zastosuj(t2.id, m.id, op.id)).rejects.toThrow(NotFoundException);
    expect(await prisma().ticketReply.count({ where: { ticketId: t2.id, automatic: null } })).toBe(0);
  });

  it('przypisanie: tylko aktywna osoba z zespołu (wcześniej przechodził id klienta)', async () => {
    const { tickets } = uslugi();
    const { op, jan } = await ludzie();
    const t = await prisma().ticket.create({ data: { userId: jan.id, subject: 'X', message: 'x' } });
    await expect(tickets.adminUpdateTicket(t.id, { assignedToId: jan.id }, op.id)).rejects.toThrow(/osoba z zespołu/);
    await prisma().user.update({ where: { id: op.id }, data: { loginBlocked: true } });
    await expect(tickets.adminUpdateTicket(t.id, { assignedToId: op.id }, op.id)).rejects.toThrow(/osoba z zespołu/);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).assignedToId).toBeNull();
    expect(await prisma().ticketEvent.count({ where: { ticketId: t.id } })).toBe(0);
  });

  it('akcje masowe: przypisz, tag ±, stan; bez zmian liczone osobno, błąd jednego nie przerywa reszty, jeden wpis w dzienniku', async () => {
    const { tickets } = uslugi();
    const { op, op2, jan } = await ludzie();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await prisma().ticket.create({ data: { userId: jan.id, subject: `T${i}`, message: 'x' } })).id);
    expect(await tickets.adminBulk(op.id, { ids, akcja: 'przypisz', assignedToId: op2.id })).toEqual({ zmienione: 3, bezZmian: 0, bledy: [] });
    expect(await tickets.adminBulk(op.id, { ids, akcja: 'przypisz', assignedToId: op2.id })).toEqual({ zmienione: 0, bezZmian: 3, bledy: [] });
    await expect(tickets.adminBulk(op.id, { ids, akcja: 'przypisz', assignedToId: jan.id })).rejects.toThrow(/osoba z zespołu/);
    expect(await tickets.adminBulk(op.id, { ids: [ids[0]!], akcja: 'tag', tag: 'VIP' })).toEqual({ zmienione: 1, bezZmian: 0, bledy: [] });
    expect(await tickets.adminBulk(op.id, { ids, akcja: 'tag', tag: 'vip', tryb: 'usun' })).toEqual({ zmienione: 1, bezZmian: 2, bledy: [] });
    // jedno scalone — stan zmienia się w celu; reszta przechodzi
    await tickets.adminMerge(ids[2]!, ids[1]!, op.id, POWOD);
    const r = await tickets.adminBulk(op.id, { ids, akcja: 'stan', status: 'IN_PROGRESS' });
    expect(r).toMatchObject({ zmienione: 2, bezZmian: 0 });
    expect(r.bledy).toEqual([{ id: ids[2], blad: 'Zgłoszenie scalone — stan zmienia się w zgłoszeniu docelowym.' }]);
    const wpisy = await prisma().auditLog.findMany({ where: { action: 'TICKETS_BULK_CHANGED' }, orderBy: { createdAt: 'asc' } });
    expect(wpisy).toHaveLength(5);
    expect(wpisy.at(-1)!.details).toMatchObject({ akcja: 'stan', wartosc: 'IN_PROGRESS', zmienione: [ids[0], ids[1]] });
    expect((await prisma().ticket.findMany({ where: { id: { in: ids } }, orderBy: { subject: 'asc' } })).map((t) => [t.assignedToId, t.status])).toEqual([
      [op2.id, 'IN_PROGRESS'],
      [op2.id, 'IN_PROGRESS'],
      [op2.id, 'CLOSED'],
    ]);
  });

  it('działy: filtr skrzynki i liczniki otwartych w każdym dziale', async () => {
    const { tickets } = uslugi();
    const { op, jan } = await ludzie();
    for (const [department, status] of [['BILLING', 'OPEN'], ['BILLING', 'OPEN'], ['BILLING', 'CLOSED'], ['SALES', 'OPEN'], ['TECHNICAL', 'IN_PROGRESS']]) {
      await prisma().ticket.create({ data: { userId: jan.id, subject: department, message: 'x', department, status } });
    }
    const r = await tickets.adminList({ dzial: 'BILLING', stan: 'otwarte' }, op.id);
    expect(r.rows.map((x) => x.department)).toEqual(['BILLING', 'BILLING']);
    expect(r.dzialy).toEqual({ TECHNICAL: 1, BILLING: 2, SALES: 1 });
    await expect(tickets.adminList({ dzial: 'ABUSE' }, op.id)).rejects.toThrow(BadRequestException);
  });
});

describe('F3.7 — raporty obsługi', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('SLA (dotrzymane / przekroczone / w toku), CSAT i osoby: odpowiedzi, mediana od pierwszej nieodpowiedzianej wiadomości klienta', async () => {
    const { raporty } = uslugi();
    const { op, op2, jan } = await ludzie();
    const teraz = new Date();
    const h = (n: number) => new Date(teraz.getTime() - n * 3600_000);
    // 1) w terminie: klient 10h temu, 2 wiadomości klienta, Anna odpowiada po 2h od PIERWSZEJ (nie od drugiej)
    const t1 = await prisma().ticket.create({
      data: { userId: jan.id, subject: '1', message: 'x', createdAt: h(10), slaResponseDueAt: h(6), slaResolveDueAt: h(1), firstResponseAt: h(8), status: 'CLOSED', resolvedAt: h(2), assignedToId: op.id,
        csatAt: h(1), csatRating: 5, agentRating: 4, csatResolved: true, csatAgentId: op.id },
    });
    await prisma().ticketReply.create({ data: { ticketId: t1.id, authorId: jan.id, message: 'i jeszcze', createdAt: h(9) } });
    await prisma().ticketReply.create({ data: { ticketId: t1.id, authorId: op.id, isStaff: true, message: 'odp', createdAt: h(8) } });
    // dopisek Anny bez nowej wiadomości klienta — liczy się do odpowiedzi, nie do czasu
    await prisma().ticketReply.create({ data: { ticketId: t1.id, authorId: op.id, isStaff: true, message: 'jeszcze jedno', createdAt: h(7.5) } });
    // notatka i automat — nie liczą się wcale
    await prisma().ticketReply.create({ data: { ticketId: t1.id, authorId: op.id, isStaff: true, internal: true, message: 'notatka', createdAt: h(7) } });
    await prisma().ticketReply.create({ data: { ticketId: t1.id, authorId: op.id, isStaff: true, automatic: 'PODZIEKOWANIE', message: 'dzięki', createdAt: h(2) } });
    // 2) po terminie: odpowiedź Piotra 4h po kliencie, termin był 1h
    const t2 = await prisma().ticket.create({
      data: { userId: jan.id, subject: '2', message: 'x', createdAt: h(6), slaResponseDueAt: h(5), slaResolveDueAt: h(-10), firstResponseAt: h(2), status: 'IN_PROGRESS', assignedToId: op2.id,
        csatAt: h(1), csatRating: 2, agentRating: 1, csatResolved: false, csatAgentId: op2.id },
    });
    await prisma().ticketReply.create({ data: { ticketId: t2.id, authorId: op2.id, isStaff: true, message: 'odp', createdAt: h(2) } });
    // 3) bez odpowiedzi, termin jeszcze nie minął
    await prisma().ticket.create({ data: { userId: jan.id, subject: '3', message: 'x', createdAt: h(1), slaResponseDueAt: h(-3), slaResolveDueAt: h(-20) } });
    // 4) scalone źródło — poza terminami
    await prisma().ticket.create({ data: { userId: jan.id, subject: '4', message: 'x', createdAt: h(3), slaResponseDueAt: h(2), scalonoDoId: t1.id, status: 'CLOSED', resolvedAt: h(2) } });
    // 5) poza okresem 7 dni
    await prisma().ticket.create({ data: { userId: jan.id, subject: '5', message: 'x', createdAt: h(24 * 10), slaResponseDueAt: h(24 * 10 - 1) } });

    const r = await raporty.raport(7, teraz);
    expect(r.okres.dni).toBe(7);
    expect(r.sla).toMatchObject({
      zgloszen: 3,
      odpowiedz: { dotrzymane: 1, przekroczone: 1, wToku: 1, bez: 0, procent: 50 },
      rozwiazanie: { dotrzymane: 1, przekroczone: 0, wToku: 2, bez: 0, procent: 100 },
      medianaPierwszejMin: 180,
    });
    expect(r.csat).toEqual({ ocen: 2, obsluga: 3.5, opiekun: 2.5, rozwiazanePct: 50 });
    expect(r.osoby).toEqual([
      { agentId: op.id, nazwa: 'Anna Nowak', odpowiedzi: 2, odpowiedziNaKlienta: 1, medianaMin: 120, zamkniete: 1, ocen: 1, ocenaOpiekuna: 4 },
      { agentId: op2.id, nazwa: 'Piotr', odpowiedzi: 1, odpowiedziNaKlienta: 1, medianaMin: 240, zamkniete: 0, ocen: 1, ocenaOpiekuna: 1 },
    ]);
    // nieznany okres → 30 dni (nie dowolny zakres z adresu)
    expect((await raporty.raport(1000, teraz)).okres.dni).toBe(30);
  });
});

describe('F3.7 — przegląd: scalone zgłoszenie zostaje zamknięte i bez nazwiska obsługi', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    maile.length = 0;
  });
  afterAll(rozlacz);

  it('ręczna zmiana stanu scalonego zgłoszenia → 400 (nie wraca do kolejki jako otwarte, do którego nie da się odpisać)', async () => {
    const { tickets } = uslugi();
    const { op, jan } = await ludzie();
    const a = await prisma().ticket.create({ data: { userId: jan.id, subject: 'A', message: 'a' } });
    const b = await prisma().ticket.create({ data: { userId: jan.id, subject: 'B', message: 'b' } });
    await tickets.adminMerge(a.id, b.id, op.id, POWOD);
    for (const status of ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER']) {
      await expect(tickets.adminUpdateTicket(a.id, { status }, op.id)).rejects.toThrow(new RegExp(`#${b.id.slice(0, 8)}`));
    }
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('CLOSED');
    expect(await prisma().ticketEvent.count({ where: { ticketId: a.id, type: 'STATUS_CHANGED' } })).toBe(0);
    expect(maile).toEqual([]);
    // przypisanie i priorytet dalej można zmienić
    await tickets.adminUpdateTicket(a.id, { priority: 'HIGH' }, op.id);
  });

  it('ocena scalonego zgłoszenia → 400; raport CSAT pomija scalone źródła', async () => {
    const { tickets, raporty } = uslugi();
    const { op, jan } = await ludzie();
    const a = await prisma().ticket.create({ data: { userId: jan.id, subject: 'A', message: 'a' } });
    const b = await prisma().ticket.create({ data: { userId: jan.id, subject: 'B', message: 'b' } });
    await tickets.adminMerge(a.id, b.id, op.id, POWOD);
    await expect(tickets.submitCsat(a.id, jan.id, 1, 'nie rozwiązane', { resolved: false })).rejects.toThrow(new RegExp(`#${b.id.slice(0, 8)}`));
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: a.id } })).csatRating).toBeNull();
    // ocena wystawiona zanim zgłoszenie scalono (stare zamknięte źródło) nie liczy się do CSAT
    await prisma().ticket.update({ where: { id: a.id }, data: { csatRating: 1, csatAt: new Date(), csatResolved: false } });
    expect((await raporty.raport(7)).csat).toEqual({ ocen: 0, obsluga: null, opiekun: null, rozwiazanePct: null });
  });

  it('wyścig: scalenie między odczytem a zapisem odpowiedzi — odpowiedź odrzucona, źródło zostaje zamknięte i puste', async () => {
    const { op, jan } = await ludzie();
    const a = await prisma().ticket.create({ data: { userId: jan.id, subject: 'A', message: 'a' } });
    const b = await prisma().ticket.create({ data: { userId: jan.id, subject: 'B', message: 'b' } });
    const przed = await prisma().ticket.findUniqueOrThrow({ where: { id: a.id } });
    await uslugi().tickets.adminMerge(a.id, b.id, op.id, POWOD);
    // TicketsService, który pierwszy odczyt zgłoszenia dostaje sprzed scalenia (scalonoDoId: null)
    const p = prisma();
    let pierwszy = true;
    const ticket = new Proxy(p.ticket, {
      get: (t, k) => {
        if (k === 'findUnique') return async (args: unknown) => (pierwszy ? ((pierwszy = false), przed) : (t.findUnique as (a: unknown) => unknown)(args));
        const v = Reflect.get(t, k);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const pp = new Proxy(p, {
      get: (t, k) => {
        if (k === 'ticket') return ticket;
        const v = Reflect.get(t, k);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const { opieka } = uslugi();
    const audit = new AuditService(p as never);
    const mailer = { send: async (m: (typeof maile)[number]) => void maile.push(m) };
    const t = new TicketsService(pp as never, mailer as never, { get: () => undefined } as never, {} as never, audit, { create: async () => undefined } as never, opieka);
    const nr = new RegExp(`#${b.id.slice(0, 8)}`);
    await expect(t.addReply(a.id, jan.id, { message: 'Halo?' })).rejects.toThrow(nr);
    pierwszy = true;
    await expect(t.adminAddReply(a.id, op.id, { message: 'Odpowiedź' })).rejects.toThrow(nr);
    const zr = await prisma().ticket.findUniqueOrThrow({ where: { id: a.id }, include: { replies: true } });
    expect(zr.status).toBe('CLOSED');
    expect(zr.replies.map((r) => r.automatic)).toEqual(['SCALONE']);
    expect(maile).toEqual([]);
  });

  it('zgłoszenie założone przez obsługę: po scaleniu klient widzi jego pierwszą wiadomość od „obsługi Verris”, bez imienia', async () => {
    const { tickets } = uslugi();
    const { op, jan } = await ludzie();
    const a = await prisma().ticket.create({ data: { userId: jan.id, subject: 'Od nas', message: 'Widzimy problem z pocztą.', openedByStaffId: op.id, assignedToId: op.id } });
    const b = await prisma().ticket.create({ data: { userId: jan.id, subject: 'B', message: 'b' } });
    await prisma().ticketReply.create({ data: { ticketId: b.id, authorId: op.id, isStaff: true, message: 'Zwykła odpowiedź' } });
    await tickets.adminMerge(a.id, b.id, op.id, POWOD);
    const widok = await tickets.findOne(b.id, jan.id);
    const przeniesiona = widok.replies.find((r) => r.message.startsWith('Ze zgłoszenia'))!;
    expect(przeniesiona).toMatchObject({ isStaff: true, autor: null, authorId: null });
    // zwykła odpowiedź obsługi dalej z imieniem (PB-37)
    expect(widok.replies.find((r) => r.message === 'Zwykła odpowiedź')!.autor).toBe('Anna N.');
    expect(JSON.stringify(widok)).not.toContain(op.id);
  });
});
