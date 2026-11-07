import { KsefStatus, Prisma } from '@verris/database';
import { NotFoundException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { InvoicesService } from '../../src/billing/invoices.service.js';
import { CZEKA_NA_OPERATORA, KsefService } from '../../src/ksef/ksef.service.js';
import type { InvoiceStatusResult, OpcjeWysylki } from '../../src/ksef/invoicing-provider.interface.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * KSeF 07.11 — „KSeF ma w pełni działać automatycznie z naszego panelu”: przepływ stanów faktury na prawdziwej
 * bazie (Postgres 16), prawdziwy builder FA(3) i walidacja XSD, atrapa klienta KSeF:
 *  - faktura spoza dnia wystawienia → offline24 z terminem i `offlineMode: true`,
 *  - 5xx przy wysyłce → offline24, backoff (bez wysyłki co cykl),
 *  - duplikat 440 („KSeF przyjął, panel padł przed zapisem”) → numer KSeF pierwotnej po zgodności skrótu,
 *    inny plik → do wyjaśnienia, automat jej nie rusza,
 *  - „do wyjaśnienia” wraca sama po 30 min, UPO pobierane automatycznie i wystawione klientowi (M-14),
 *  - alarm o terminie dosłania raz na 6 h, 429 wstrzymuje cykle, XSD zatrzymuje fakturę przed wysyłką,
 *  - korekta techniczna faktury offline (hashOfCorrectedInvoice).
 */

const sterowanie = vi.hoisted(() => ({ xsdBlad: null as string | null }));
vi.mock('../../src/ksef/fa3-xsd.js', async (orig) => {
  const m = await orig<typeof import('../../src/ksef/fa3-xsd.js')>();
  return {
    ...m,
    walidujFa3Xsd: async (xml: string) => (sterowanie.xsdBlad ? { ok: false, bledy: [sterowanie.xsdBlad] } : m.walidujFa3Xsd(xml)),
  };
});

interface Wysylka {
  xml: string;
  opcje: OpcjeWysylki | undefined;
}
const wyslane: Wysylka[] = [];
const sesje = new Map<string, { numer: string; skrotB64: string }>();
let statusy: Record<string, Partial<InvoiceStatusResult>> = {};
let bladWysylki: Record<string, unknown> | null = null;
let otwarcia = 0;
const klient = {
  openSession: async () => {
    otwarcia += 1;
  },
  terminateSession: async () => undefined,
  sendInvoice: async (xml: string, opcje?: OpcjeWysylki) => {
    if (bladWysylki) throw Object.assign(new Error('KSeF odmawia'), bladWysylki);
    wyslane.push({ xml, opcje });
    return { elementReferenceNumber: `sesja-${wyslane.length}|ref-${wyslane.length}` };
  },
  invoiceStatus: async (ref: string): Promise<InvoiceStatusResult> => ({
    processed: false,
    ksefReferenceNumber: null,
    acquisitionTimestamp: null,
    statusCode: 150,
    statusDescription: 'Trwa przetwarzanie',
    rejected: false,
    ...statusy[ref],
  }),
  fakturaWSesji: async (sesja: string, numer: string) => {
    const f = sesje.get(sesja);
    return f && f.numer === numer ? { skrotB64: f.skrotB64, przyjeto: '2026-11-07T08:00:00Z' } : null;
  },
  downloadUpo: async (ref: string) => `<UPO ref="${ref}"/>`,
};

function ksef() {
  const p = prisma() as never;
  const ustawienia = {
    getKsefRuntimeConfig: async () => ({ enabled: true, nip: '9292069367', token: 't', env: 'test' }),
    getKsefSettings: async () => ({ enabled: true, env: 'test', nip: '9292069367', tokenSet: true, metoda: 'token', certyfikatUwierzytelniania: null, certyfikatOffline: null }),
  };
  const s = new KsefService(p, { get: () => undefined } as never, new AuditService(p), ustawienia as never);
  (s as unknown as { buildClient: () => Promise<unknown> }).buildClient = async () => ({ client: klient, env: 'test' });
  return s;
}

let n = 0;
const sprzedawca = { name: 'HVLN Dominik Kowalski', nip: '9292069367', address: 'Zacisze 2A', postalCode: '65-775', city: 'Zielona Góra', country: 'PL', email: 'faktury@verris.pl' };
const pozycja = { name: 'Hosting Standard', quantity: 1, unitNet: '100.00', vatRate: 23, totalNet: '100.00', totalVat: '23.00', totalGross: '123.00' };

async function uzytkownik(role: 'USER' | 'ADMIN' = 'USER') {
  n += 1;
  return prisma().user.create({ data: { email: `ksef-auto-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', role } as never });
}

async function faktura(over: Record<string, unknown> = {}, userId?: string) {
  n += 1;
  return prisma().invoice.create({
    data: {
      userId: userId ?? (await uzytkownik()).id,
      number: `VFV/2026/11/${String(n).padStart(4, '0')}`,
      rodzajPrawny: 'FAKTURA_VAT',
      status: 'PAID',
      amount: new Prisma.Decimal('123.00'),
      netAmount: new Prisma.Decimal('100.00'),
      vatAmount: new Prisma.Decimal('23.00'),
      vatRate: new Prisma.Decimal('23'),
      currency: 'PLN',
      provider: 'WALLET',
      providerRef: `wpis-auto-${n}`,
      issuedAt: new Date(),
      paidAt: new Date(),
      storageKey: `x/${n}.pdf`,
      sellerSnapshot: sprzedawca,
      buyerSnapshot: { name: 'Anna Nowak', address: 'Leśna 3', postalCode: '61-001', city: 'Poznań', country: 'PL', email: 'anna@example.com' },
      lineItems: [pozycja],
      ksefStatus: KsefStatus.PENDING,
      ...over,
    } as never,
  });
}
const stan = (id: string) => prisma().invoice.findUniqueOrThrow({ where: { id } });
const b64 = (b64url: string) => Buffer.from(b64url, 'base64url').toString('base64');

describe('KSeF 07.11 – automatyka obiegu faktury (Postgres)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    wyslane.length = 0;
    sesje.clear();
    statusy = {};
    bladWysylki = null;
    otwarcia = 0;
    sterowanie.xsdBlad = null;
  });
  afterAll(rozlacz);

  it('faktura niewysłana w dniu wystawienia: offline24 z terminem i offlineMode=true przy wysyłce', async () => {
    const wczoraj = new Date(Date.now() - 36 * 3600_000);
    const f = await faktura({ issuedAt: wczoraj, paidAt: wczoraj });
    await ksef().tick();
    const po = await stan(f.id);
    expect(po).toMatchObject({ ksefStatus: KsefStatus.SUBMITTED, ksefTryb: 'OFFLINE24' });
    expect(po.ksefTerminDo).not.toBeNull();
    expect(wyslane[0].opcje).toMatchObject({ offlineMode: true });
  });

  it('faktura z dnia: zwykła wysyłka online (offlineMode=false), bez trybu i terminu', async () => {
    const f = await faktura();
    await ksef().tick();
    expect(await stan(f.id)).toMatchObject({ ksefStatus: KsefStatus.SUBMITTED, ksefTryb: null, ksefTerminDo: null });
    expect(wyslane[0].opcje?.offlineMode).toBe(false);
  });

  it('KSeF niedostępny przy uwierzytelnieniu: OFFLINE w trybie offline24 (nie „niesklasyfikowany”), termin = następny dzień roboczy', async () => {
    const f = await faktura();
    const s = ksef();
    const otworz = klient.openSession;
    klient.openSession = async () => {
      throw new Error('KSeF 2.0 niedostępny (/auth/challenge): fetch failed');
    };
    try {
      await s.tick();
    } finally {
      klient.openSession = otworz;
    }
    const po = await stan(f.id);
    expect(po).toMatchObject({ ksefStatus: KsefStatus.OFFLINE, ksefTryb: 'OFFLINE24' });
    expect(po.ksefTerminDo!.getTime()).toBeGreaterThan(Date.now());
  });

  it('5xx przy wysyłce: offline24, licznik prób i backoff – kolejny cykl jej nie wysyła; po terminie próby idzie z offlineMode', async () => {
    const f = await faktura();
    bladWysylki = { httpStatus: 503 };
    await ksef().tick();
    const po = await stan(f.id);
    expect(po).toMatchObject({ ksefStatus: KsefStatus.OFFLINE, ksefTryb: 'OFFLINE24', ksefProby: 1 });
    expect(po.ksefNastepnaProba!.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    bladWysylki = null;
    await prisma().invoice.update({ where: { id: f.id }, data: { ksefSubmittedAt: new Date(Date.now() - 16 * 60_000) } });
    await ksef().tick();
    expect(wyslane).toHaveLength(0);
    await prisma().invoice.update({ where: { id: f.id }, data: { ksefNastepnaProba: new Date(Date.now() - 1000) } });
    await ksef().tick();
    expect(wyslane).toHaveLength(1);
    expect(wyslane[0].opcje?.offlineMode).toBe(true);
    expect(await stan(f.id)).toMatchObject({ ksefStatus: KsefStatus.SUBMITTED, ksefProby: 0, ksefNastepnaProba: null });
  });

  it('duplikat 440 (KSeF przyjął, panel nie zapisał): numer KSeF pierwotnej po zgodności skrótu pliku – przyjęta, nie odrzucona', async () => {
    const f = await faktura();
    const s = ksef();
    await s.tick();
    const wyslana = await stan(f.id);
    sesje.set('sesja-pierwotna', { numer: '9292069367-20261107-0100001AF629-AF', skrotB64: b64(wyslana.ksefXmlSha256!) });
    statusy[wyslana.ksefElementRef!] = { statusCode: 440, statusDescription: 'Duplikat faktury', rejected: true, duplikat: { numerKsef: '9292069367-20261107-0100001AF629-AF', sesja: 'sesja-pierwotna' } };
    await s.tick();
    expect(await stan(f.id)).toMatchObject({
      ksefStatus: KsefStatus.ACCEPTED,
      ksefNumber: '9292069367-20261107-0100001AF629-AF',
      ksefElementRef: 'sesja-pierwotna|ksef:9292069367-20261107-0100001AF629-AF',
      ksefError: null,
    });
    // UPO pierwotnej pobrane po numerze KSeF w kolejnym cyklu.
    await s.tick();
    expect((await stan(f.id)).ksefUpo).toBe('<UPO ref="sesja-pierwotna|ksef:9292069367-20261107-0100001AF629-AF"/>');
  });

  it('duplikat 440 z INNYM plikiem w KSeF: do wyjaśnienia, powiadomienie admina, automat jej nie wysyła ponownie', async () => {
    const admin = await uzytkownik('ADMIN');
    const f = await faktura();
    const s = ksef();
    await s.tick();
    const wyslana = await stan(f.id);
    sesje.set('s-p', { numer: '9292069367-20261107-0100001AF629-AF', skrotB64: 'INNY-SKROT' });
    statusy[wyslana.ksefElementRef!] = { statusCode: 440, rejected: true, duplikat: { numerKsef: '9292069367-20261107-0100001AF629-AF', sesja: 's-p' } };
    await s.tick();
    const po = await stan(f.id);
    expect(po.ksefStatus).toBe(KsefStatus.UNCERTAIN);
    expect(po.ksefError).toMatch(/plik w KSeF różni się/);
    expect(po.ksefNastepnaProba).toEqual(CZEKA_NA_OPERATORA);
    expect(await prisma().notification.count({ where: { userId: admin.id, title: { contains: 'duplikat' } } })).toBe(1);
    await prisma().invoice.update({ where: { id: f.id }, data: { ksefSubmittedAt: new Date(Date.now() - 60 * 60_000) } });
    await s.tick();
    expect(wyslane).toHaveLength(1);
  });

  it('wysyłka bez odpowiedzi → „do wyjaśnienia”; po 30 min automat wysyła ten sam plik ponownie (bez drugiego powiadomienia)', async () => {
    const admin = await uzytkownik('ADMIN');
    const f = await faktura();
    bladWysylki = { niepewny: true };
    await ksef().tick();
    const niepewna = await stan(f.id);
    expect(niepewna.ksefStatus).toBe(KsefStatus.UNCERTAIN);
    await ksef().tick();
    expect(wyslane).toHaveLength(0); // przed upływem 30 min nie rusza
    bladWysylki = null;
    await prisma().invoice.update({ where: { id: f.id }, data: { ksefSubmittedAt: new Date(Date.now() - 31 * 60_000) } });
    await ksef().tick();
    expect(wyslane.map((w) => w.xml)).toEqual([niepewna.ksefXml]);
    expect((await stan(f.id)).ksefStatus).toBe(KsefStatus.SUBMITTED);
    expect(await prisma().notification.count({ where: { userId: admin.id } })).toBe(1);
  });

  it('UPO: pobrane automatycznie po przyjęciu; klient pobiera tylko swoje (M-14), z linkiem weryfikacji i datą przyjęcia na liście', async () => {
    const wlasciciel = await uzytkownik();
    const obcy = await uzytkownik();
    const f = await faktura({}, wlasciciel.id);
    const s = ksef();
    await s.tick();
    const ref = (await stan(f.id)).ksefElementRef!;
    statusy[ref] = { processed: true, ksefReferenceNumber: '9292069367-20261107-0100001AF62A-11', acquisitionTimestamp: '2026-11-07T09:00:00Z', statusCode: 200 };
    await s.tick();
    expect((await stan(f.id)).ksefUpo).toBe(`<UPO ref="${ref}"/>`);

    const nic = {} as never;
    const inv = new InvoicesService(prisma() as never, new AuditService(prisma() as never), nic, nic, nic, nic, s, nic, nic);
    const { rows } = await inv.listForUser(wlasciciel.id);
    expect(rows[0]).toMatchObject({ ksefNumber: '9292069367-20261107-0100001AF62A-11', ksefPrzyjeto: '2026-11-07T09:00:00.000Z', ksefUpo: true });
    expect(rows[0].ksefWeryfikacja).toMatch(/^https:\/\/qr-test\.ksef\.mf\.gov\.pl\/invoice\/9292069367\/\d{2}-\d{2}-\d{4}\/[A-Za-z0-9_-]{43}$/);
    await expect(inv.pobierzUpoKsef(wlasciciel.id, f.id)).resolves.toMatchObject({ xml: `<UPO ref="${ref}"/>` });
    await expect(inv.pobierzUpoKsef(obcy.id, f.id)).rejects.toThrow(NotFoundException);
  });

  it('alarm o terminie dosłania: jedno powiadomienie dla adminów, powtórka dopiero po 6 h', async () => {
    const admin = await uzytkownik('ADMIN');
    await faktura({ ksefStatus: KsefStatus.OFFLINE, ksefTryb: 'OFFLINE24', ksefTerminDo: new Date(Date.now() + 2 * 3600_000) });
    const s = ksef();
    await s.alarmujTerminy();
    await s.alarmujTerminy();
    expect(await prisma().notification.count({ where: { userId: admin.id, title: { contains: 'termin dosłania' } } })).toBe(1);
    await prisma().invoice.updateMany({ data: { ksefAlertTerminuAt: new Date(Date.now() - 7 * 3600_000) } });
    await s.alarmujTerminy();
    expect(await prisma().notification.count({ where: { userId: admin.id } })).toBe(2);
  });

  it('429 z Retry-After: cykl wstrzymany – kolejny cykl nie woła KSeF', async () => {
    await faktura();
    await faktura();
    bladWysylki = { httpStatus: 429, przejsciowy: true, retryAfterS: 120 };
    const s = ksef();
    await s.tick();
    bladWysylki = null;
    const przed = otwarcia;
    await s.tick();
    expect(otwarcia).toBe(przed);
    expect(wyslane).toHaveLength(0);
    expect((await s.adminOverview()).wstrzymanoDo).not.toBeNull();
  });

  it('plik niezgodny z XSD FA(3): REJECTED lokalnie z powodem, nic nie idzie do KSeF, plik nie jest zapisany', async () => {
    sterowanie.xsdBlad = "wiersz 12: Element 'Podmiot2': Missing child element(s).";
    const f = await faktura();
    await ksef().tick();
    const po = await stan(f.id);
    expect(po.ksefStatus).toBe(KsefStatus.REJECTED);
    expect(po.ksefError).toContain('Niezgodność ze schematem FA(3): wiersz 12');
    expect(po.ksefXml).toBeNull();
    expect(wyslane).toHaveLength(0);
  });

  it('korekta techniczna: odrzucona przez KSeF faktura offline po „Ponów” idzie z hashOfCorrectedInvoice = skrót odrzuconego pliku', async () => {
    const wczoraj = new Date(Date.now() - 36 * 3600_000);
    const f = await faktura({ issuedAt: wczoraj, paidAt: wczoraj });
    const s = ksef();
    await s.tick();
    const pierwszy = await stan(f.id);
    statusy[pierwszy.ksefElementRef!] = { statusCode: 450, statusDescription: 'Błąd weryfikacji semantyki dokumentu faktury', rejected: true };
    await s.tick();
    expect((await stan(f.id)).ksefStatus).toBe(KsefStatus.REJECTED);
    await s.retryInvoice(f.id, 'admin');
    expect((await stan(f.id)).ksefSkrotKorygowanej).toBe(pierwszy.ksefXmlSha256);
    await s.tick();
    expect(wyslane.at(-1)!.opcje).toEqual({ offlineMode: true, hashOfCorrectedInvoice: b64(pierwszy.ksefXmlSha256!) });
  });

  it('status 550 („Spróbuj ponownie”): faktura wraca do wysyłki (offline, backoff), nie jest odrzucona', async () => {
    const f = await faktura();
    const s = ksef();
    await s.tick();
    statusy[(await stan(f.id)).ksefElementRef!] = { statusCode: 550, statusDescription: 'Operacja została anulowana przez system', rejected: true };
    await s.tick();
    expect(await stan(f.id)).toMatchObject({ ksefStatus: KsefStatus.OFFLINE, ksefElementRef: null, ksefProby: 1 });
  });
});
