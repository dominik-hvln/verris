import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { PocztaPrzychodzacaService } from '../../src/tickets/poczta/poczta-przychodzaca.service.js';
import { MailerService } from '../../src/mail/mailer.service.js';
import { atrapaImap } from '../../src/test/atrapa-imap.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * F3.7 (OE-19, OE-20, D6) — poczta przychodząca do zgłoszeń na prawdziwym Postgresie: atrapa serwera IMAP, magazyn
 * plików w pamięci. Nowy mail klienta → zgłoszenie, odpowiedź → wątek, idempotencja po Message-ID i słowie
 * kluczowym IMAP, spam/automaty/blokady bez zgłoszeń, obcy nadawca → kolejka z plikami za „Pokaż”.
 */
const eml = (n: string) => readFileSync(join(import.meta.dirname, '../../src/tickets/poczta/__fixtures__', n));
const ID = '1a2b3c4d-0000-4000-8000-0000000000aa';
const maile: Array<{ to: string; tag?: string; subject: string }> = [];
const magazyn = new Map<string, Buffer>();

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const mailer = { send: async (m: (typeof maile)[number]) => void maile.push(m) };
  const config = { get: () => undefined };
  const notifications = { create: async () => undefined };
  const ai = { supportSuggestion: async () => null };
  const storage = {
    putObject: async (_b: string, k: string, buf: Buffer) => void magazyn.set(k, Buffer.from(buf)),
    removeObject: async (_b: string, k: string) => void magazyn.delete(k),
    getObjectStream: async (_b: string, k: string) => Readable.from([magazyn.get(k)!]),
  };
  const opieka = new OpiekaZgloszenService(p, mailer as never, config as never, audit, notifications as never, ai as never);
  const tickets = new TicketsService(p, mailer as never, config as never, storage as never, audit, notifications as never, opieka);
  const poczta = new PocztaPrzychodzacaService(p, tickets, storage as never, audit, config as never);
  return { tickets, poczta };
}

const K = { host: 'atrapa', port: 993, login: 'zgloszenia@verris.pl', haslo: 'x' };

async function konto(email: string, role: 'USER' | 'STAFF' = 'USER') {
  return prisma().user.create({ data: { email, passwordHash: 'x', role } });
}

async function import_(wiadomosci: Record<number, string>) {
  const a = await atrapaImap({ wiadomosci: new Map(Object.entries(wiadomosci).map(([u, n]) => [Number(u), eml(n)])) });
  try {
    const w = await uslugi().poczta.pobierz(K, a.polacz);
    return { ...w, oznaczone: [...a.oznaczone] };
  } finally {
    await a.zamknij();
  }
}

const wpis = (messageId: string) => prisma().pocztaPrzychodzaca.findUniqueOrThrow({ where: { messageId } });

describe('F3.7 — poczta przychodząca do zgłoszeń', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().pocztaPrzychodzaca.deleteMany({});
    await prisma().pocztaBlokadaNadawcy.deleteMany({});
    maile.length = 0;
    magazyn.clear();
  });
  afterAll(rozlacz);

  it('mail klienta → zgłoszenie (temat, treść, tag, PDF jako załącznik, .exe pominięty); drugi import bez dubla', async () => {
    const jan = await konto('jan@klient.pl');
    await konto('opiekun@verris.pl', 'STAFF');
    const w = await import_({ 7: 'nowe-zgloszenie.eml' });
    expect(w).toEqual({ nowe: 1, bledy: [], oznaczone: [7] });

    const p = await wpis('<CAF1234nowe@mail.klient.pl>');
    expect(p).toMatchObject({ wynik: 'ZGLOSZENIE', userId: jan.id, rodzaj: 'SUPPORT', uid: 7, tresc: null });
    const t = await prisma().ticket.findUniqueOrThrow({ where: { id: p.ticketId! }, include: { attachments: true } });
    expect(t).toMatchObject({ userId: jan.id, subject: 'Błąd 500 na stronie sklepu', status: 'OPEN', tags: ['e-mail'] });
    expect(t.message).toContain('strona sklepu zwraca błąd 500');
    expect(t.message).toContain('Nie dołączono pliku „faktura.pdf.exe”');
    expect(t.slaResponseDueAt).not.toBeNull();
    expect(t.attachments.map((a) => [a.originalName, a.mimeType, a.uploadedById])).toEqual([['faktura.pdf', 'application/pdf', jan.id]]);
    expect(magazyn.has(t.attachments[0].storageKey)).toBe(true);
    // Klient dostaje potwierdzenie (nowe zgłoszenie z maila jak z panelu).
    expect(maile.some((m) => m.to === 'jan@klient.pl')).toBe(true);

    // Ten sam mail bez słowa kluczowego (np. ktoś je zdjął) — Message-ID już jest, nic nowego.
    expect(await import_({ 7: 'nowe-zgloszenie.eml' })).toEqual({ nowe: 0, bledy: [], oznaczone: [7] });
    expect(await prisma().ticket.count()).toBe(1);
  });

  it('dwa procesy naraz z tym samym mailem — jedno zgłoszenie (unikalny Message-ID w transakcji)', async () => {
    await konto('jan@klient.pl');
    const { poczta } = uslugi();
    const m = eml('nowe-zgloszenie.eml');
    const imap = {
      naglowki: async () => ({ rozmiar: m.length, naglowki: m.subarray(0, m.indexOf('\r\n\r\n') + 2) }),
      wiadomosc: async () => m,
    };
    const wyniki = await Promise.all([poczta.przetworz(imap, 1, 'z'), poczta.przetworz(imap, 1, 'z')]);
    expect(wyniki.filter(Boolean)).toHaveLength(1);
    expect(await prisma().ticket.count()).toBe(1);
    expect(await prisma().ticketAttachment.count()).toBe(1);
  });

  it('odpowiedź z Gmaila (nagłówki wątku) i z Outlooka („[#…]” w temacie) → wątek zgłoszenia, bez cytatu, zgłoszenie znów otwarte', async () => {
    const jan = await konto('jan@klient.pl');
    await prisma().ticket.create({ data: { id: ID, userId: jan.id, subject: 'DNS', message: 'x', status: 'WAITING_CUSTOMER', waitingSince: new Date() } });
    expect(await import_({ 1: 'odpowiedz-gmail.eml', 2: 'odpowiedz-outlook.eml' })).toMatchObject({ nowe: 2, bledy: [] });
    const r = await prisma().ticketReply.findMany({ where: { ticketId: ID }, orderBy: { createdAt: 'asc' } });
    expect(r.map((x) => [x.message, x.isStaff, x.authorId])).toEqual([
      ['Dziękuję, rekordy już zmieniłem. Czy teraz jest OK?', false, jan.id],
      ['Nadal nie dziala.', false, jan.id],
    ]);
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: ID } })).status).toBe('OPEN');
    expect(await wpis('<CAF5678odp@mail.gmail.com>')).toMatchObject({ wynik: 'ODPOWIEDZ', ticketId: ID, replyId: r[0].id });

    // Mail do klienta w tym zgłoszeniu odpowiada na jego ostatni mail (In-Reply-To) i ma go w References.
    const wyslane: Array<Record<string, unknown>> = [];
    const mailer = new MailerService(
      { id: 'p', send: async (m: Record<string, unknown>) => (wyslane.push(m), { providerId: 'p', messageId: null }) } as never,
      { fromAddress: 'panel@verris.pl', fromName: 'Verris', swallowErrors: true },
      prisma() as never,
      { get: () => undefined } as never,
    );
    await mailer.send({ to: 'jan@klient.pl', subject: 'x', text: 'x', zgloszenieId: ID });
    expect(wyslane[0]).toMatchObject({
      inReplyTo: '<AM0PR01outlook@eurprd.outlook.com>',
      references: [`<zgl.${ID}@verris.pl>`, '<CAF5678odp@mail.gmail.com>', '<AM0PR01outlook@eurprd.outlook.com>'],
    });
  });

  it('nadawca z konta, ale nie właściciel zgłoszenia z wątku → kolejka z podpowiedzią zgłoszenia (bez wpisu w cudzym wątku)', async () => {
    const wlasciciel = await konto('ktos@inny.pl');
    await konto('jan@klient.pl');
    await prisma().ticket.create({ data: { id: ID, userId: wlasciciel.id, subject: 'DNS', message: 'x' } });
    await import_({ 1: 'odpowiedz-gmail.eml' });
    expect(await prisma().ticketReply.count()).toBe(0);
    expect(await wpis('<CAF5678odp@mail.gmail.com>')).toMatchObject({ wynik: 'BEZ_KLIENTA', sugerowaneZgloszenieId: ID, powod: 'nadawca nie jest właścicielem zgłoszenia z wątku' });
  });

  it('spam, autoresponder, zwrotka i nadawca z listy blokad — zapis bez zgłoszenia i bez maila do nadawcy', async () => {
    await konto('jan@klient.pl');
    await prisma().pocztaBlokadaNadawcy.create({ data: { wzorzec: '@firma-zewnetrzna.pl' } });
    expect(await import_({ 1: 'spam.eml', 2: 'autoresponder.eml', 3: 'zwrotka.eml', 4: 'obcy-z-plikami.eml' })).toMatchObject({ nowe: 4, oznaczone: [1, 2, 3, 4] });
    expect(await prisma().ticket.count()).toBe(0);
    expect(maile).toEqual([]);
    expect(await wpis('<spam-001@tani-towar.example>')).toMatchObject({ wynik: 'SPAM', tresc: 'Kup teraz.' });
    expect((await wpis('<auto-001@klient.pl>')).wynik).toBe('AUTO');
    expect((await wpis('<bounce-001@mx.klient.pl>')).wynik).toBe('AUTO');
    expect(await wpis('<obcy-001@firma-zewnetrzna.pl>')).toMatchObject({ wynik: 'BLOKADA', powod: 'lista blokad: @firma-zewnetrzna.pl', tresc: null });
    expect(magazyn.size).toBe(0);
  });

  it('za duży mail — tylko nagłówki (bez pobierania treści)', async () => {
    const { poczta } = uslugi();
    const m = eml('nowe-zgloszenie.eml');
    const wiadomosc = vi.fn();
    await poczta.przetworz({ naglowki: async () => ({ rozmiar: 20 * 1024 * 1024, naglowki: m.subarray(0, m.indexOf('\r\n\r\n') + 2) }), wiadomosc }, 3, 'z');
    expect(wiadomosc).not.toHaveBeenCalled();
    expect(await wpis('<CAF1234nowe@mail.klient.pl>')).toMatchObject({ wynik: 'ZA_DUZY', powod: '20 MB' });
  });

  it('obcy nadawca → kolejka (abuse@): plik tylko po „Pokaż”, przypisanie do klienta zakłada zgłoszenie raz', async () => {
    const jan = await konto('jan@klient.pl');
    const op = await konto('op@verris.pl', 'STAFF');
    await import_({ 5: 'obcy-z-plikami.eml' });
    const w = await wpis('<obcy-001@firma-zewnetrzna.pl>');
    expect(w).toMatchObject({ wynik: 'BEZ_KLIENTA', rodzaj: 'ABUSE', userId: null, powod: 'nadawca spoza kont klientów' });
    expect(w.tresc).toContain('podszywa sie pod bank');

    const { poczta } = uslugi();
    const lista = await poczta.lista({});
    expect(lista.liczby).toEqual({ kolejka: 1, spam: 0 });
    // Lista bez kluczy magazynu; pliki pominięte opisane.
    expect(lista.rows[0].zalaczniki).toEqual([
      { nazwa: 'zrzut.jpg', typ: 'image/jpeg', rozmiar: expect.any(Number), nr: 0, dostepny: true },
      { nazwa: 'dowody.zip', pominiety: 'niedozwolony typ pliku', nr: 1, dostepny: false },
      { nazwa: 'raport.pdf', pominiety: 'treść nie pasuje do rozszerzenia', nr: 2, dostepny: false },
    ]);
    await expect(poczta.plik(w.id, 0, false, op.id)).rejects.toBeInstanceOf(BadRequestException);
    const plik = await poczta.plik(w.id, 0, true, op.id);
    expect(plik).toMatchObject({ nazwa: 'zrzut.jpg', typ: 'image/jpeg' });
    expect(await prisma().auditLog.count({ where: { action: 'POCZTA_ZGLOSZEN_PLIK_POKAZANY', actorUserId: op.id } })).toBe(1);

    const { ticketId } = await poczta.przypisz(w.id, op.id, { userId: jan.id });
    const t = await prisma().ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { replies: true, attachments: true } });
    expect(t).toMatchObject({ userId: jan.id, subject: 'Phishing na stronie hostowanej u Was' });
    // Pliki zostają w kolejce (za „Pokaż”), klient ich nie widzi; w zgłoszeniu notatka wewnętrzna.
    expect(t.attachments).toEqual([]);
    expect(t.replies.filter((r) => r.internal).map((r) => r.message.includes('zrzut.jpg'))).toEqual([true]);
    expect(await wpis(w.messageId)).toMatchObject({ wynik: 'PRZYPISANY', ticketId, userId: jan.id, obsluzylId: op.id, tresc: null });
    await expect(poczta.przypisz(w.id, op.id, { userId: jan.id })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma().ticket.count()).toBe(1);
  });

  it('przypisanie po adresie klienta i dopisanie do zgłoszenia po numerze #xxxxxxxx (notatka wewnętrzna)', async () => {
    const jan = await konto('jan@klient.pl');
    const op = await konto('op@verris.pl', 'STAFF');
    await prisma().ticket.create({ data: { id: ID, userId: jan.id, subject: 'DNS', message: 'x' } });
    await import_({ 5: 'obcy-z-plikami.eml', 6: 'spam.eml' });
    const { poczta } = uslugi();
    const obcy = await wpis('<obcy-001@firma-zewnetrzna.pl>');
    await expect(poczta.przypisz(obcy.id, op.id, { email: 'nie-ma@x.pl' })).rejects.toThrow(/Nie znaleziono konta/);
    expect((await wpis(obcy.messageId)).wynik).toBe('BEZ_KLIENTA');
    const { ticketId } = await poczta.przypisz(obcy.id, op.id, { zgloszenieId: '1A2B3C4D' });
    expect(ticketId).toBe(ID);
    const notatka = await prisma().ticketReply.findFirstOrThrow({ where: { ticketId: ID, internal: true } });
    expect(notatka.message).toContain('Mail od Anna Obca <anna@firma-zewnetrzna.pl>');
    expect(notatka.message).toContain('podszywa sie pod bank');
    // Spam też da się przypisać („to nie spam”) — po adresie klienta.
    const spam = await wpis('<spam-001@tani-towar.example>');
    const r = await poczta.przypisz(spam.id, op.id, { email: 'JAN@klient.pl' });
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: r.ticketId } })).userId).toBe(jan.id);
  });

  it('odrzucenie z blokadą: treść i pliki skasowane, następny mail nadawcy od razu jako BLOKADA', async () => {
    const op = await konto('op@verris.pl', 'STAFF');
    await import_({ 5: 'obcy-z-plikami.eml' });
    const w = await wpis('<obcy-001@firma-zewnetrzna.pl>');
    expect(magazyn.size).toBe(1);
    const { poczta } = uslugi();
    await poczta.odrzuc(w.id, op.id, { powod: 'reklama', zablokuj: true });
    expect(await wpis(w.messageId)).toMatchObject({ wynik: 'ODRZUCONY', tresc: null, zalaczniki: [] });
    expect(magazyn.size).toBe(0);
    expect(await prisma().pocztaBlokadaNadawcy.findMany()).toMatchObject([{ wzorzec: 'anna@firma-zewnetrzna.pl', createdById: op.id }]);
    await expect(poczta.zablokuj('@verris.pl', undefined, op.id)).rejects.toBeInstanceOf(BadRequestException);
    await poczta.odblokuj('anna@firma-zewnetrzna.pl', op.id);
    expect(await prisma().pocztaBlokadaNadawcy.count()).toBe(0);
  });

  it('retencja: wpisy bez zgłoszenia starsze niż 90 dni znikają razem z plikami', async () => {
    await import_({ 5: 'obcy-z-plikami.eml' });
    const { poczta } = uslugi();
    expect(await poczta.retencja(new Date(Date.now() + 89 * 86_400_000))).toBe(0);
    expect(await poczta.retencja(new Date(Date.now() + 91 * 86_400_000))).toBe(1);
    expect(magazyn.size).toBe(0);
    expect(await prisma().pocztaPrzychodzaca.count()).toBe(0);
  });
});
