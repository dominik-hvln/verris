import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { TicketsService } from '../../src/tickets/tickets.service.js';
import { OpiekaZgloszenService } from '../../src/tickets/opieka-zgloszen.service.js';
import { LIMIT_NOWYCH_NA_GODZINE, PocztaPrzychodzacaService, type AktorPoczty } from '../../src/tickets/poczta/poczta-przychodzaca.service.js';
import { DataExportService } from '../../src/compliance/data-export.service.js';
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

async function konto(email: string, role: 'USER' | 'STAFF' | 'ADMIN' = 'USER') {
  return prisma().user.create({ data: { email, passwordHash: 'x', role } });
}

/** Operator z rolą o podanych uprawnieniach (suma ról — jak StaffPermissionsGuard). */
async function operator(email: string, uprawnienia: string[]): Promise<AktorPoczty> {
  const u = await konto(email, 'STAFF');
  const r = await prisma().staffRole.create({ data: { name: `rola-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, permissions: uprawnienia } });
  await prisma().staffRoleAssignment.create({ data: { userId: u.id, roleId: r.id } });
  return { userId: u.id, role: 'STAFF' };
}
const ZESPOL_NADUZYC = ['TICKETS_VIEW', 'TICKETS_MANAGE', 'ABUSE_MANAGE'];

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
    const op = await operator('op@verris.pl', ZESPOL_NADUZYC);
    await import_({ 5: 'obcy-z-plikami.eml' });
    const w = await wpis('<obcy-001@firma-zewnetrzna.pl>');
    expect(w).toMatchObject({ wynik: 'BEZ_KLIENTA', rodzaj: 'ABUSE', userId: null, powod: 'nadawca spoza kont klientów' });
    expect(w.tresc).toContain('podszywa sie pod bank');

    const { poczta } = uslugi();
    const lista = await poczta.lista({}, op);
    expect(lista.liczby).toEqual({ kolejka: 1, spam: 0 });
    // Lista bez kluczy magazynu; pliki pominięte opisane.
    expect(lista.rows[0].zalaczniki).toEqual([
      { nazwa: 'zrzut.jpg', typ: 'image/jpeg', rozmiar: expect.any(Number), nr: 0, dostepny: true },
      { nazwa: 'dowody.zip', pominiety: 'niedozwolony typ pliku', nr: 1, dostepny: false },
      { nazwa: 'raport.pdf', pominiety: 'treść nie pasuje do rozszerzenia', nr: 2, dostepny: false },
    ]);
    await expect(poczta.plik(w.id, 0, false, op)).rejects.toBeInstanceOf(BadRequestException);
    const plik = await poczta.plik(w.id, 0, true, op);
    expect(plik).toMatchObject({ nazwa: 'zrzut.jpg', typ: 'image/jpeg' });
    expect(await prisma().auditLog.count({ where: { action: 'POCZTA_ZGLOSZEN_PLIK_POKAZANY', actorUserId: op.userId } })).toBe(1);

    // Przegląd F3.7 — mail z abuse@ nie staje się wiadomością klienta (treść i dane zgłaszającego); wpis zostaje w kolejce.
    await expect(poczta.przypisz(w.id, op, { userId: jan.id })).rejects.toThrow(/abuse@ dopisz do zgłoszenia/);
    expect(await wpis(w.messageId)).toMatchObject({ wynik: 'BEZ_KLIENTA', obsluzylId: null });
    expect(await prisma().ticket.count()).toBe(0);

    // Dopisanie do zgłoszenia klienta — notatka wewnętrzna bez treści i danych zgłaszającego (audyt Fali 3); treść
    // i pliki zostają we wpisie kolejki (zespół nadużyć), wpis bez userId klienta.
    await prisma().ticket.create({ data: { id: ID, userId: jan.id, subject: 'Phishing', message: 'x' } });
    const { ticketId } = await poczta.przypisz(w.id, op, { zgloszenieId: ID });
    const t = await prisma().ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { replies: true, attachments: true } });
    expect(t.attachments).toEqual([]);
    expect(t.replies.map((r) => r.internal)).toEqual([true]);
    expect(t.replies[0].message).toMatch(/^Zgłoszenie nadużycia z abuse@ \(wpis [0-9a-f]{8}, /);
    expect(t.replies[0].message).not.toMatch(/anna|firma-zewnetrzna|Obca|podszywa|zrzut\.jpg/i);
    const po = await wpis(w.messageId);
    expect(po).toMatchObject({ wynik: 'PRZYPISANY', ticketId, userId: null, obsluzylId: op.userId });
    expect(po.tresc).toContain('podszywa sie pod bank');
    expect(await prisma().auditLog.findFirstOrThrow({ where: { action: 'POCZTA_ZGLOSZEN_PRZYPISANA' } })).toMatchObject({ userId: null, details: { rodzaj: 'ABUSE' } });
    // Plik dalej za „Pokaż” (zespół nadużyć).
    expect(await poczta.plik(w.id, 0, true, op)).toMatchObject({ nazwa: 'zrzut.jpg' });
    await expect(poczta.przypisz(w.id, op, { zgloszenieId: ID })).rejects.toBeInstanceOf(ConflictException);

    // Eksport RODO zgłoszonego klienta: ani treści, ani nazwiska, ani adresu zgłaszającego (art. 15 ust. 4 RODO).
    const eksport = new DataExportService(prisma() as never, new AuditService(prisma() as never), { get: () => undefined } as never, {} as never, {} as never);
    const sekcje = JSON.stringify(await (eksport as unknown as { collectSections(id: string): Promise<unknown> }).collectSections(jan.id));
    expect(sekcje).toContain('Zgłoszenie nadużycia z abuse@');
    expect(sekcje).not.toMatch(/anna@firma-zewnetrzna|Anna Obca|podszywa/i);
    // Wpis sprzed poprawki (abuse@ przypisany z userId klienta) też nie wychodzi; własny mail klienta z kolejki — tak.
    await prisma().pocztaPrzychodzaca.update({ where: { id: w.id }, data: { userId: jan.id } });
    await prisma().pocztaPrzychodzaca.create({
      data: { messageId: '<wlasny@klient.pl>', skrzynka: 'z', nadawca: 'jan@klient.pl', temat: 'Mój mail', otrzymano: new Date(), rozmiar: 1, wynik: 'BEZ_KLIENTA', userId: jan.id, tresc: 'Treść klienta' },
    });
    const sekcje2 = (await (eksport as unknown as { collectSections(id: string): Promise<Record<string, unknown>> }).collectSections(jan.id)) as Record<string, Array<Record<string, unknown>>>;
    expect(sekcje2['incoming-mail'].map((m) => m.temat)).toEqual(['Mój mail']);
    expect(JSON.stringify(sekcje2)).not.toMatch(/anna@firma-zewnetrzna|podszywa/i);
  });

  it('obcy nadawca na support@ → założenie zgłoszenia klientowi po jego koncie, tylko raz', async () => {
    const jan = await konto('jan@klient.pl');
    const op = await konto('op@verris.pl', 'STAFF');
    const a = await atrapaImap({
      wiadomosci: new Map([[1, Buffer.from('Message-ID: <drugi-adres@prywatny.pl>\r\nFrom: jan.prywatnie@prywatny.pl\r\nTo: support@verris.pl\r\nSubject: Faktura\r\nContent-Type: text/plain\r\n\r\nProsze o fakture.\r\n')]]),
    });
    try {
      await uslugi().poczta.pobierz(K, a.polacz);
    } finally {
      await a.zamknij();
    }
    const w = await wpis('<drugi-adres@prywatny.pl>');
    expect(w).toMatchObject({ wynik: 'BEZ_KLIENTA', rodzaj: 'SUPPORT' });
    const { poczta } = uslugi();
    // support@ — zwykłe TICKETS_MANAGE wystarcza (bez ABUSE_MANAGE).
    const l1 = { userId: op.id, role: 'STAFF' };
    const { ticketId } = await poczta.przypisz(w.id, l1, { userId: jan.id });
    expect(await prisma().ticket.findUniqueOrThrow({ where: { id: ticketId } })).toMatchObject({ userId: jan.id, subject: 'Faktura', message: 'Prosze o fakture.' });
    expect(await wpis(w.messageId)).toMatchObject({ wynik: 'PRZYPISANY', userId: jan.id, tresc: null });
    await expect(poczta.przypisz(w.id, l1, { userId: jan.id })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma().ticket.count()).toBe(1);
  });

  it('przypisanie po adresie klienta i dopisanie do zgłoszenia po numerze #xxxxxxxx (notatka wewnętrzna)', async () => {
    const jan = await konto('jan@klient.pl');
    const op = await operator('op@verris.pl', ZESPOL_NADUZYC);
    await prisma().ticket.create({ data: { id: ID, userId: jan.id, subject: 'DNS', message: 'x' } });
    await import_({ 5: 'obcy-z-plikami.eml', 6: 'spam.eml' });
    const { poczta } = uslugi();
    const obcy = await wpis('<obcy-001@firma-zewnetrzna.pl>');
    await expect(poczta.przypisz(obcy.id, op, { email: 'nie-ma@x.pl' })).rejects.toThrow(/Nie znaleziono konta/);
    expect((await wpis(obcy.messageId)).wynik).toBe('BEZ_KLIENTA');
    const { ticketId } = await poczta.przypisz(obcy.id, op, { zgloszenieId: '1A2B3C4D' });
    expect(ticketId).toBe(ID);
    // abuse@ — w notatce tylko odsyłacz do wpisu kolejki (audyt Fali 3), bez nadawcy i treści.
    const notatka = await prisma().ticketReply.findFirstOrThrow({ where: { ticketId: ID, internal: true } });
    expect(notatka.message).toContain(`wpis ${obcy.id.slice(0, 8)}`);
    expect(notatka.message).not.toContain('anna@firma-zewnetrzna.pl');
    expect(notatka.message).not.toContain('podszywa sie pod bank');
    // Spam też da się przypisać („to nie spam”) — po adresie klienta.
    const spam = await wpis('<spam-001@tani-towar.example>');
    const r = await poczta.przypisz(spam.id, op, { email: 'JAN@klient.pl' });
    expect((await prisma().ticket.findUniqueOrThrow({ where: { id: r.ticketId } })).userId).toBe(jan.id);
  });

  it('odrzucenie z blokadą: treść i pliki skasowane, następny mail nadawcy od razu jako BLOKADA', async () => {
    const op = await operator('op@verris.pl', ZESPOL_NADUZYC);
    await import_({ 5: 'obcy-z-plikami.eml' });
    const w = await wpis('<obcy-001@firma-zewnetrzna.pl>');
    expect(magazyn.size).toBe(1);
    const { poczta } = uslugi();
    await poczta.odrzuc(w.id, op, { powod: 'reklama', zablokuj: true });
    expect(await wpis(w.messageId)).toMatchObject({ wynik: 'ODRZUCONY', tresc: null, zalaczniki: [] });
    expect(magazyn.size).toBe(0);
    expect(await prisma().pocztaBlokadaNadawcy.findMany()).toMatchObject([{ wzorzec: 'anna@firma-zewnetrzna.pl', createdById: op.userId }]);
    await expect(poczta.zablokuj('@verris.pl', undefined, op)).rejects.toBeInstanceOf(BadRequestException);
    await poczta.odblokuj('anna@firma-zewnetrzna.pl', op.userId);
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

  it('audyt Fali 3 — retencja: wpis przypisany do zgłoszenia zostaje (wątek), ale po 90 dniach bez plików w magazynie i bez treści', async () => {
    const jan = await konto('jan@klient.pl');
    const op = await operator('op@verris.pl', ZESPOL_NADUZYC);
    await prisma().ticket.create({ data: { id: ID, userId: jan.id, subject: 'Phishing', message: 'x' } });
    await import_({ 5: 'obcy-z-plikami.eml' });
    const w = await wpis('<obcy-001@firma-zewnetrzna.pl>');
    const { poczta } = uslugi();
    await poczta.przypisz(w.id, op, { zgloszenieId: ID });
    expect(magazyn.size).toBe(1);
    expect(await poczta.retencja(new Date(Date.now() + 89 * 86_400_000))).toBe(0);
    expect(await poczta.retencja(new Date(Date.now() + 91 * 86_400_000))).toBe(1);
    expect(magazyn.size).toBe(0);
    const po = await wpis(w.messageId);
    expect(po).toMatchObject({ wynik: 'PRZYPISANY', ticketId: ID, tresc: null });
    expect(po.zalaczniki).toEqual(expect.arrayContaining([{ nazwa: 'zrzut.jpg', typ: 'image/jpeg', rozmiar: expect.any(Number), pominiety: 'usunięty po 90 dniach (retencja)' }]));
    // Drugi przebieg nie wraca do wpisu bez plików i treści.
    expect(await poczta.retencja(new Date(Date.now() + 92 * 86_400_000))).toBe(0);
    await expect(poczta.plik(w.id, 0, true, op)).rejects.toThrow(/Nie ma takiego pliku/);
  });

  it('audyt Fali 3 — abuse@ tylko dla zespołu nadużyć: L1/Sprzedaż/NOC nie widzą, nie pobierają, nie przypisują, nie odrzucają; domenę blokuje zespół nadużyć', async () => {
    await konto('jan@klient.pl');
    await import_({ 5: 'obcy-z-plikami.eml', 6: 'spam.eml' });
    const w = await wpis('<obcy-001@firma-zewnetrzna.pl>');
    const { poczta } = uslugi();
    const l1 = await operator('l1@verris.pl', ['TICKETS_VIEW', 'TICKETS_MANAGE']);
    const noc = await operator('noc@verris.pl', ['TICKETS_VIEW']);
    const abuse = await operator('abuse@verris.pl', ZESPOL_NADUZYC);
    const admin = { userId: (await konto('admin@verris.pl', 'ADMIN')).id, role: 'ADMIN' };

    for (const o of [l1, noc]) {
      const l = await poczta.lista({ widok: 'wszystkie' }, o);
      expect(l.rows.map((r) => r.rodzaj)).toEqual(['SUPPORT']);
      expect(l.liczby).toEqual({ kolejka: 0, spam: 1 });
      await expect(poczta.plik(w.id, 0, true, o)).rejects.toBeInstanceOf(ForbiddenException);
    }
    await expect(poczta.przypisz(w.id, l1, { zgloszenieId: ID })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(poczta.odrzuc(w.id, l1, { powod: 'spam', zablokuj: true })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await wpis(w.messageId)).toMatchObject({ wynik: 'BEZ_KLIENTA', tresc: expect.stringContaining('podszywa') });
    expect(magazyn.size).toBe(1);
    expect(await prisma().auditLog.count({ where: { action: 'POCZTA_ZGLOSZEN_PLIK_POKAZANY' } })).toBe(0);

    // Blokada całej domeny wycisza zgłoszenia nadużyć z tej domeny — tylko zespół nadużyć albo ADMIN; adres — L1.
    await expect(poczta.zablokuj('@cert.pl', 'spam', l1)).rejects.toBeInstanceOf(ForbiddenException);
    await poczta.zablokuj('spamer@tani-towar.example', 'spam', l1);
    await poczta.zablokuj('@tani-towar.example', 'spam', abuse);
    await poczta.zablokuj('@reklama.example', 'spam', admin);
    expect((await prisma().pocztaBlokadaNadawcy.findMany()).map((b) => b.wzorzec).sort()).toEqual(['@reklama.example', '@tani-towar.example', 'spamer@tani-towar.example']);

    for (const o of [abuse, admin]) {
      expect((await poczta.lista({}, o)).rows.map((r) => r.id)).toEqual([w.id]);
    }
  });

  // ---------------------------------------------------------------- przegląd F3.7

  /** Prosty mail tekstowy (CRLF) do scenariuszy przeglądu. */
  const prosty = (o: { id: string; od: string; do?: string; temat?: string }) =>
    Buffer.from(
      [
        `Message-ID: <${o.id}@mail.test>`,
        'Date: Sun, 11 Oct 2026 09:15:00 +0200',
        `From: ${o.od}`,
        `To: ${o.do ?? 'support@verris.pl'}`,
        `Subject: ${o.temat ?? 'Pytanie'}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Dzień dobry, mam pytanie.',
        '',
      ].join('\r\n'),
    );
  const importuj = async (wiadomosci: Buffer[]) => {
    const a = await atrapaImap({ wiadomosci: new Map(wiadomosci.map((b, i) => [i + 1, b])) });
    try {
      return await uslugi().poczta.pobierz(K, a.polacz);
    } finally {
      await a.zamknij();
    }
  };

  it('NUL w temacie, nazwie i treści oraz data z roku -10000 — zgłoszenie zapisane (wcześniej błąd zapisu w każdym przebiegu)', async () => {
    const jan = await konto('jan@klient.pl');
    expect(await import_({ 1: 'nul-i-zla-data.eml' })).toEqual({ nowe: 1, bledy: [], oznaczone: [1] });
    const p = await wpis('<nul-001@mail.klient.pl>');
    expect(p).toMatchObject({ wynik: 'ZGLOSZENIE', userId: jan.id, nadawcaNazwa: 'Jan Kowalski', temat: 'Awaria poczty' });
    expect(Math.abs(p.otrzymano.getTime() - Date.now())).toBeLessThan(60_000);
    const t = await prisma().ticket.findUniqueOrThrow({ where: { id: p.ticketId! } });
    expect([t.subject, t.message]).toEqual(['Awaria poczty', 'Poczta nie działa od rana.']);
  });

  it('subkonto: bez TICKETS_MANAGE albo wyłączone → kolejka z podpowiedzią konta; z TICKETS_MANAGE → zgłoszenie właściciela', async () => {
    const wl = await konto('wlasciciel@klient.pl');
    const sub = (email: string, d: Record<string, unknown>) =>
      prisma().user.create({ data: { email, passwordHash: 'x', role: 'USER', customerOwnerId: wl.id, ...d } });
    await sub('tylko-odczyt@klient.pl', { customerPermissions: ['TICKETS_READ'] });
    await sub('wylaczone@klient.pl', { customerPermissions: ['TICKETS_MANAGE'], subaccountDisabledAt: new Date() });
    await sub('pracownik@klient.pl', { customerPermissions: ['TICKETS_READ', 'TICKETS_MANAGE'] });
    // Wątek właściciela: subkonto bez uprawnień nie dopisze się też do istniejącego zgłoszenia.
    await prisma().ticket.create({ data: { id: ID, userId: wl.id, subject: 'DNS', message: 'x' } });
    expect(
      await importuj([
        prosty({ id: 'sub-1', od: 'tylko-odczyt@klient.pl' }),
        prosty({ id: 'sub-2', od: 'wylaczone@klient.pl' }),
        prosty({ id: 'sub-3', od: 'tylko-odczyt@klient.pl', temat: 'Re: [#1a2b3c4d] DNS' }),
        prosty({ id: 'sub-4', od: 'pracownik@klient.pl' }),
      ]),
    ).toEqual({ nowe: 4, bledy: [] });
    expect(await wpis('<sub-1@mail.test>')).toMatchObject({ wynik: 'BEZ_KLIENTA', userId: wl.id, powod: 'subkonto bez uprawnienia do zgłoszeń' });
    expect(await wpis('<sub-2@mail.test>')).toMatchObject({ wynik: 'BEZ_KLIENTA', userId: wl.id, powod: 'subkonto wyłączone albo konto właściciela zablokowane' });
    expect(await wpis('<sub-3@mail.test>')).toMatchObject({ wynik: 'BEZ_KLIENTA', userId: wl.id, sugerowaneZgloszenieId: ID });
    expect(await prisma().ticketReply.count({ where: { ticketId: ID } })).toBe(0);
    expect(await wpis('<sub-4@mail.test>')).toMatchObject({ wynik: 'ZGLOSZENIE', userId: wl.id });
    expect(await prisma().ticket.count()).toBe(2);
    // Potwierdzenie tylko do właściciela, tylko za zgłoszenie od uprawnionego subkonta.
    expect(maile.filter((m) => m.tag === 'ticket.created' || /Otrzymaliśmy/.test(m.subject)).map((m) => m.to)).toEqual(['wlasciciel@klient.pl']);
  });

  it(`hamulec pętli: najwyżej ${LIMIT_NOWYCH_NA_GODZINE} nowych zgłoszeń z maili konta na godzinę — dalsze do kolejki, bez potwierdzenia`, async () => {
    await konto('jan@klient.pl');
    const n = LIMIT_NOWYCH_NA_GODZINE + 2;
    const w = await importuj(Array.from({ length: n }, (_, i) => prosty({ id: `petla-${i}`, od: 'jan@klient.pl', temat: `Automatyczna odpowiedź ${i}` })));
    expect(w).toEqual({ nowe: n, bledy: [] });
    expect(await prisma().ticket.count()).toBe(LIMIT_NOWYCH_NA_GODZINE);
    const kolejka = await prisma().pocztaPrzychodzaca.findMany({ where: { wynik: 'BEZ_KLIENTA' } });
    expect(kolejka).toHaveLength(2);
    expect(kolejka[0].powod).toMatch(/pętla/);
    expect(maile.filter((m) => m.to === 'jan@klient.pl')).toHaveLength(LIMIT_NOWYCH_NA_GODZINE);
  });

  it('abuse@ tylko po dokładnym adresie — „notabuse@verris.pl” to zwykłe zgłoszenie', async () => {
    await konto('jan@klient.pl');
    await importuj([prosty({ id: 'nie-abuse', od: 'jan@klient.pl', do: 'notabuse@verris.pl' }), prosty({ id: 'abuse', od: 'jan@klient.pl', do: 'Abuse@Verris.pl' })]);
    expect((await wpis('<nie-abuse@mail.test>')).rodzaj).toBe('SUPPORT');
    expect((await wpis('<abuse@mail.test>')).rodzaj).toBe('ABUSE');
  });
});
