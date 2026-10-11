import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { inflateRawSync } from 'zlib';
import { Prisma } from '@verris/database';
import { DataExportService } from './data-export.service.js';

/**
 * X-22 — eksport danych osobowych (RODO art. 20) sprawdzany end-to-end: prawdziwy
 * archiver 8 buduje prawdziwy ZIP na dysku, a test go rozpakowuje. Do 2026-08-22
 * eksport wywalał się w runtime przy każdym żądaniu (X-21) i nic tego nie złapało,
 * bo żaden test nie dotykał tej ścieżki.
 */

/** Minimalny czytnik ZIP (katalog centralny + deflate) — bez nowej zależności. */
function rozpakuj(buf: Buffer): Map<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('to nie jest ZIP');
  const ile = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < ile; i++) {
    const metoda = buf.readUInt16LE(p + 10);
    const rozmiar = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28), eLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const lokalny = buf.readUInt32LE(p + 42);
    const nazwa = buf.subarray(p + 46, p + 46 + nLen).toString('utf8');
    const start = lokalny + 30 + buf.readUInt16LE(lokalny + 26) + buf.readUInt16LE(lokalny + 28);
    const dane = buf.subarray(start, start + rozmiar);
    out.set(nazwa, (metoda === 8 ? inflateRawSync(dane) : dane).toString('utf8'));
    p += 46 + nLen + eLen + cLen;
  }
  return out;
}

const OPERATOR = '7b0c2f4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OPERATOR_B = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';

function zbuduj(opts: { brakujacyZalacznik?: boolean } = {}) {
  const lista = <T>(v: T) => vi.fn(async () => v);
  const prisma = {
    user: {
      // Konta obsługi (STAFF/ADMIN) — eksport ma pytać tylko o role pracowników.
      findMany: vi.fn(async (args: { where: { id?: { in: string[] }; role: { in: string[] } } }) =>
        args.where.role.in.includes('STAFF')
          ? [OPERATOR, OPERATOR_B].filter((id) => !args.where.id || args.where.id.in.includes(id)).map((id) => ({ id }))
          : []),
      findUniqueOrThrow: lista({
        id: 'u1', email: 'jan@firma.pl', passwordHash: '$2b$10$tajne', twoFactorSecret: 'SEKRET-TOTP', staffBreakGlassCodesEnc: 'enc:kody-awaryjne',
        twoFactorRecoveryCodesEnc: 'kody', createdAt: new Date('2026-01-01T00:00:00Z'), walletBalance: BigInt(4500),
      }),
    },
    account: {
      findMany: lista([
        { id: 'a1', domain: 'x.pl', daPasswordEnc: 'enc:haslo-da', mailBlockedAt: null, mailBlockedById: null, mailBlockedReason: null },
        // F3.1 — wysyłka zablokowana przez obsługę (decyzja abuse): id pracownika i notatka zespołu w wierszu konta.
        {
          id: 'a2', domain: 'y.pl', daPasswordEnc: null, mailBlockedAt: new Date('2026-10-05T08:00:00Z'), mailBlockedById: OPERATOR,
          mailBlockedReason: 'Nadużycie #ab12cd34: zgłoszenie od abuse@zglaszajacy.example, 4000 maili w godzinę',
        },
      ]),
    },
    subscription: { findMany: lista([{ id: 's1', individualTermsById: OPERATOR_B, price: new Prisma.Decimal('19.99') }]) },
    walletTransaction: { findMany: lista([]) },
    invoice: { findMany: lista([{ id: 'i1', number: 'FV/1/2026' }]) },
    ticket: {
      findMany: lista([
        { id: 't1', subject: 'Pomoc', openedByStaffId: null, assignedToId: 'operator-8', escalatedById: 'operator-9', csatAgentId: 'operator-8' },
        // Zgłoszenie założone przez obsługę jest przypisane do zakładającego (adminCreateOnBehalf).
        { id: 't2', subject: 'Awaria', openedByStaffId: 'operator-7', assignedToId: 'operator-7', escalatedById: null, csatAgentId: null },
      ]),
    },
    ticketAttachment: {
      findMany: lista([
        { id: 'z0', originalName: 'zrzut.png', storageKey: 'k0', uploadedById: 'operator-7' },
        { id: 'z1', originalName: 'faktura.pdf', storageKey: 'k1', uploadedById: 'u1' },
        { id: 'z2', originalName: 'faktura.pdf', storageKey: 'k2' },
        { id: 'z3', originalName: '../../etc/passwd', storageKey: 'k3' },
      ]),
    },
    ticketReply: {
      findMany: lista([
        { id: 'r1', ticketId: 't1', authorId: 'u1', isStaff: false, internal: false, automatic: null, message: 'Dalej nie działa.' },
        { id: 'r2', ticketId: 't1', authorId: 'operator-7', isStaff: true, internal: false, automatic: null, message: 'Sprawdzamy.' },
        { id: 'r3', ticketId: 't1', authorId: 'operator-7', isStaff: true, internal: true, automatic: null, message: 'Klient zgłaszał to już w marcu.' },
      ]),
    },
    userConsent: { findMany: lista([{ id: 'c1', documentType: 'TERMS' }]) },
    marketingPreferences: { findUnique: lista({ userId: 'u1', marketingEmail: false }) },
    dataExportRequest: { findMany: lista([]) },
    accountDeletionRequest: { findMany: lista([]) },
    auditLog: {
      findMany: lista([
        // Klient sam zmienił hasło — jego wpis zostaje bez zmian.
        { id: 'l1', action: 'PASSWORD_CHANGED', userId: 'u1', actorUserId: 'u1', impersonatedBy: null, details: null, ipAddress: '198.51.100.4', userAgent: 'Firefox' },
        // Tablica migracji: operator przypisał migrację koledze (id obu w szczegółach), z IP i przeglądarką operatora.
        {
          id: 'l2', action: 'MIGRATION_HANDLING_UPDATED', userId: 'u1', actorUserId: OPERATOR, impersonatedBy: null,
          details: { migrationRequestId: 'm1', zmiany: { przypisanyDoId: { przed: null, po: OPERATOR_B } }, lista: [OPERATOR_B] },
          ipAddress: '203.0.113.9', userAgent: 'Chrome-operatora',
        },
        // Impersonacja przez obsługę.
        { id: 'l3', action: 'HOSTING_PHP_CHANGED', userId: 'u1', actorUserId: 'u1', impersonatedBy: OPERATOR_B, details: { domain: 'x.pl' }, ipAddress: '203.0.113.10', userAgent: 'Safari' },
        // Akcje obsługi z paska konta/domeny zakończone błędem węzła — wpis zespołu ma userId klienta.
        {
          id: 'l4', action: 'OPERATOR_ACCOUNT_CHANGED', userId: 'u1', actorUserId: OPERATOR, impersonatedBy: null, ipAddress: null, userAgent: null,
          details: { akcja: 'blokada-wysylki', wynik: 'blad', blad: 'Węzeł nie obsługuje blokady wysyłki (brak HAVE_BLACKLIST_USERNAMES w ustawieniach exima — zaktualizuj exim.conf przez CustomBuild).' },
        },
        {
          id: 'l5', action: 'OPERATOR_DOMAIN_CHANGED', userId: 'u1', actorUserId: OPERATOR, impersonatedBy: null, ipAddress: null, userAgent: null,
          details: { akcja: 'ns', wynik: 'blad', blad: 'Rejestr nie odpowiedział w czasie' },
        },
        // Błąd połączenia z hostem panelu węzła w innym wpisie (np. wniosek, który się nie wykonał).
        {
          id: 'l6', action: 'OPERATOR_REQUEST_FAILED', userId: 'u1', actorUserId: OPERATOR, impersonatedBy: null, ipAddress: null, userAgent: null,
          details: { wniosekId: 'w1', blad: 'connect ETIMEDOUT da-t1.wezly.example — węzeł nie odpowiadał przed chwilą' },
        },
        // Błąd bez śladów infrastruktury zostaje (np. odmowa karty klienta).
        { id: 'l7', action: 'WALLET_AUTO_TOPUP_FAILED', userId: 'u1', actorUserId: null, impersonatedBy: null, ipAddress: null, userAgent: null, details: { error: 'Karta została odrzucona.' } },
      ]),
    },
    customerNote: {
      findMany: vi.fn(async (args: { select?: Record<string, boolean> }) => {
        // Prawdziwy wiersz ma authorId — eksport ma go nie wybierać (select), więc mock oddaje tylko wybrane pola.
        const wiersz = { id: 'n1', authorId: 'operator-7', body: 'Klient prosił o kontakt telefoniczny.', pinned: true,
          createdAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-01T10:00:00Z') };
        const sel = args?.select;
        return [sel ? Object.fromEntries(Object.entries(wiersz).filter(([k]) => sel[k])) : wiersz];
      }),
    },
    migrationRequest: {
      findMany: vi.fn(async (args: { select?: Record<string, unknown> }) => {
        // Prawdziwy wiersz ma dane dostępowe i id pracownika — eksport ma ich nie wybierać.
        const wiersz = {
          id: 'm1', targetDomain: 'sklep.pl', status: 'COMPLETED', sourceBundleEnc: 'enc:hasla-starego-hostingu', przypisanyDoId: 'operator-7',
          etapObslugi: 'ZAMKNIETA', createdAt: new Date('2026-10-01T10:00:00Z'),
          checklista: { ttl300: { at: '2026-10-02T10:00:00.000Z', przez: 'operator-7' }, testPrzed: { tekst: 'LCP 4,1 s', at: '2026-10-02T10:00:00.000Z', przez: 'operator-7' } },
          kontakty: [{ kanal: 'TELEFON', tresc: 'Klient potwierdził zmianę DNS na jutro rano.', ticketId: null, kiedy: new Date('2026-10-02T09:00:00Z') }],
        };
        const sel = args?.select;
        return [sel ? Object.fromEntries(Object.entries(wiersz).filter(([k]) => sel[k])) : wiersz];
      }),
    },
    server: { findMany: lista([{ name: 't1', hostname: 't1.verris.pl', daHost: 'da-t1.wezly.example', ipAddress: '203.0.113.50', ipv6Address: null }]) },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
  const storage = {
    getObjectStream: vi.fn(async (_b: string, key: string) => {
      if (opts.brakujacyZalacznik && key === 'k2') throw new Error('NoSuchKey');
      return Readable.from([Buffer.from(`zawartosc-${key}`)]);
    }),
  };
  const config = { get: vi.fn(() => undefined) };
  const svc = new DataExportService(prisma as never, {} as never, config as never, {} as never, storage as never);
  return { svc };
}

describe('X-22 — eksport RODO buduje prawdziwe archiwum', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'x22-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const zbudujZip = async (svc: DataExportService) => {
    const plik = join(dir, 'eksport.zip');
    await (svc as unknown as { buildZipToFile(u: string, p: string): Promise<void> }).buildZipToFile('u1', plik);
    return rozpakuj(readFileSync(plik));
  };

  it('archiwum zawiera README, sekcje JSON i załączniki zgłoszeń', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    for (const n of ['README.txt', 'profile.json', 'accounts.json', 'invoices.json', 'consents.json', 'tickets.json', 'marketing-preferences.json', '_meta.json']) {
      expect(pliki.has(n)).toBe(true);
    }
    expect(pliki.get('README.txt')).toContain('RODO art. 20');
    // White label (CL-02): README trafia do klienta — bez nazwy panelu serwera.
    expect(pliki.get('README.txt')).not.toMatch(/DirectAdmin/i);
    expect(JSON.parse(pliki.get('invoices.json')!)).toEqual([{ id: 'i1', number: 'FV/1/2026' }]);
    expect(pliki.get('attachments/faktura.pdf')).toBe('zawartosc-k1');
    expect(pliki.get('attachments/z2_faktura.pdf')).toBe('zawartosc-k2');
  });

  it('sekrety są zaczernione, a BigInt i daty serializują się poprawnie', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    const profil = JSON.parse(pliki.get('profile.json')!);
    expect(profil).toMatchObject({ passwordHash: '[REDACTED]', twoFactorSecret: '[REDACTED]', twoFactorRecoveryCodesEnc: '[REDACTED]', walletBalance: '4500', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(JSON.parse(pliki.get('accounts.json')!)[0].daPasswordEnc).toBe('[REDACTED]');
    const calosc = [...pliki.values()].join('\n');
    for (const sekret of ['$2b$10$tajne', 'SEKRET-TOTP', 'enc:haslo-da', 'enc:kody-awaryjne']) expect(calosc).not.toContain(sekret);
  });

  it('F2.4 — notatki obsługi o kliencie są w eksporcie, bez autora (art. 15 RODO, D3)', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    expect(pliki.get('README.txt')).toContain('customer-notes.json');
    const notatki = JSON.parse(pliki.get('customer-notes.json')!);
    expect(notatki).toEqual([
      { body: 'Klient prosił o kontakt telefoniczny.', pinned: true, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', autor: 'Obsługa Verris' },
    ]);
    expect(pliki.get('customer-notes.json')).not.toContain('operator-7');
  });

  it('D11 — obsługa migracji (checklista, log kontaktów) w eksporcie, bez haseł starego hostingu i id pracowników', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    expect(pliki.get('README.txt')).toContain('migrations.json');
    const [m] = JSON.parse(pliki.get('migrations.json')!) as Array<Record<string, unknown>>;
    expect(m).toMatchObject({
      id: 'm1',
      etapObslugi: 'ZAMKNIETA',
      checklista: {
        ttl300: { at: '2026-10-02T10:00:00.000Z', autor: 'Obsługa Verris' },
        testPrzed: { tekst: 'LCP 4,1 s', at: '2026-10-02T10:00:00.000Z', autor: 'Obsługa Verris' },
      },
      kontakty: [{ kanal: 'TELEFON', tresc: 'Klient potwierdził zmianę DNS na jutro rano.', autor: 'Obsługa Verris' }],
    });
    expect(pliki.get('migrations.json')).not.toContain('operator-7');
    expect(pliki.get('migrations.json')).not.toContain('enc:hasla-starego-hostingu');
  });

  it('F2.5 — notatki obsługi w wątku zgłoszenia są w eksporcie (internal: true), wpisy obsługi bez id pracownika', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    const wpisy = JSON.parse(pliki.get('ticket-replies.json')!) as Array<Record<string, unknown>>;
    expect(wpisy.find((r) => r.id === 'r3')).toMatchObject({ internal: true, message: 'Klient zgłaszał to już w marcu.', authorId: null, autor: 'Obsługa Verris' });
    expect(wpisy.find((r) => r.id === 'r2')).toMatchObject({ authorId: null, autor: 'Obsługa Verris' });
    expect(wpisy.find((r) => r.id === 'r1')).toMatchObject({ authorId: 'u1' });
    const zgl = JSON.parse(pliki.get('tickets.json')!) as Array<Record<string, unknown>>;
    expect(zgl.map((t) => t.zalozylaObsluga)).toEqual([false, true]);
    expect(pliki.get('ticket-replies.json')).not.toContain('operator-7');
    expect(pliki.get('tickets.json')).not.toContain('operator-7');
    expect(pliki.get('README.txt')).toContain('notatki obsługi (internal: true)');
  });

  it('przegląd F2.5 — zgłoszenia i załączniki w eksporcie bez id pracowników (opiekun, eskalujący, agent, kto dodał plik)', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    for (const plik of ['tickets.json', 'ticket-attachments.json']) expect(pliki.get(plik)).not.toMatch(/operator-\d/);
    const zgl = JSON.parse(pliki.get('tickets.json')!) as Array<Record<string, unknown>>;
    expect(zgl[0]).toMatchObject({ maOpiekuna: true, eskalowalaObsluga: true, ocenianyAgent: 'Obsługa Verris' });
    expect(zgl[1]).toMatchObject({ zalozylaObsluga: true, maOpiekuna: true, eskalowalaObsluga: false, ocenianyAgent: null });
    const zal = JSON.parse(pliki.get('ticket-attachments.json')!) as Array<Record<string, unknown>>;
    expect(zal.find((a) => a.id === 'z0')).toMatchObject({ uploadedById: null, dodala: 'Obsługa Verris' });
    expect(zal.find((a) => a.id === 'z1')).toMatchObject({ uploadedById: 'u1' });
  });

  it('przegląd D11 — dziennik konta bez id pracowników (aktor, impersonacja, szczegóły) i bez IP operatora', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    const plik = pliki.get('audit-log.json')!;
    expect(plik).not.toContain(OPERATOR);
    expect(plik).not.toContain(OPERATOR_B);
    expect(plik).not.toContain('203.0.113.9');
    expect(plik).not.toContain('Chrome-operatora');
    const wpisy = JSON.parse(plik) as Array<Record<string, unknown>>;
    expect(wpisy.find((w) => w.id === 'l1')).toMatchObject({ actorUserId: 'u1', ipAddress: '198.51.100.4', userAgent: 'Firefox' });
    expect(wpisy.find((w) => w.id === 'l2')).toMatchObject({
      actorUserId: null,
      aktor: 'Obsługa Verris',
      ipAddress: null,
      details: { migrationRequestId: 'm1', zmiany: { przypisanyDoId: { przed: null, po: 'Obsługa Verris' } }, lista: ['Obsługa Verris'] },
    });
    expect(wpisy.find((w) => w.id === 'l3')).toMatchObject({ actorUserId: 'u1', impersonatedBy: 'Obsługa Verris', ipAddress: null, details: { domain: 'x.pl' } });
    expect(pliki.get('README.txt')).toContain('bez id pracowników');
  });

  it('audyt Fal 2 — żadna sekcja nie zawiera id pracownika (blokada wysyłki, warunki indywidualne) ani powodu blokady', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    for (const [nazwa, tresc] of pliki) {
      expect(tresc, nazwa).not.toContain(OPERATOR);
      expect(tresc, nazwa).not.toContain(OPERATOR_B);
    }
    const konta = JSON.parse(pliki.get('accounts.json')!) as Array<Record<string, unknown>>;
    expect(konta.find((a) => a.id === 'a2')).toMatchObject({ mailBlockedAt: '2026-10-05T08:00:00.000Z', mailBlockedById: 'Obsługa Verris' });
    expect(konta.find((a) => a.id === 'a1')).toMatchObject({ mailBlockedById: null });
    expect(pliki.get('accounts.json')).not.toMatch(/Nadużycie|zglaszajacy/);
    expect(JSON.parse(pliki.get('subscriptions.json')!)).toEqual([{ id: 's1', individualTermsById: 'Obsługa Verris', price: '19.99' }]);
  });

  it('audyt Fal 2 — dziennik w eksporcie bez surowych błędów węzła (exim, CustomBuild, host węzła); zwykły błąd zostaje', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    const plik = pliki.get('audit-log.json')!;
    expect(plik).not.toMatch(/exim|CustomBuild|HAVE_BLACKLIST|da-t1\.wezly|ETIMEDOUT|Rejestr nie odpowiedział/i);
    const wpisy = JSON.parse(plik) as Array<{ id: string; details: Record<string, unknown> }>;
    const ogolny = 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';
    expect(wpisy.find((w) => w.id === 'l4')!.details).toMatchObject({ akcja: 'blokada-wysylki', wynik: 'blad', blad: ogolny });
    expect(wpisy.find((w) => w.id === 'l5')!.details).toMatchObject({ wynik: 'blad', blad: ogolny });
    expect(wpisy.find((w) => w.id === 'l6')!.details).toMatchObject({ wniosekId: 'w1', blad: ogolny });
    expect(wpisy.find((w) => w.id === 'l7')!.details).toEqual({ error: 'Karta została odrzucona.' });
  });

  it('nazwa załącznika nie wychodzi poza katalog attachments/ (zip slip)', async () => {
    const pliki = await zbudujZip(zbuduj().svc);
    const nazwy = [...pliki.keys()];
    expect(nazwy.some((n) => n.includes('..') && n.includes('/etc/'))).toBe(false);
    expect(nazwy).toContain('attachments/.._.._etc_passwd');
  });

  it('brakujący obiekt w magazynie nie psuje eksportu — reszta archiwum powstaje', async () => {
    const pliki = await zbudujZip(zbuduj({ brakujacyZalacznik: true }).svc);
    expect(pliki.has('profile.json')).toBe(true);
    expect(pliki.has('attachments/faktura.pdf')).toBe(true);
    expect(pliki.has('attachments/z2_faktura.pdf')).toBe(false);
  });
});
