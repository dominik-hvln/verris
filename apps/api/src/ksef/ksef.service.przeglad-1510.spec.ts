import { KsefStatus } from '@verris/database';
import { KsefService } from './ksef.service.js';

/**
 * Przegląd KSeF 15.10 (przed przełączeniem TEST → PROD) — każdy przypadek czerwony na kodzie sprzed poprawki.
 */

// Atrapy: budowa XML (osobno testowana) i forma zapłaty; klient KSeF 2.0 zapisuje adres środowiska.
const zbudowane: Array<{ number: string; correctedKsefNumber: string | null }> = [];
vi.mock('./fa3-xml.builder.js', async (orig) => ({
  ...(await orig<object>()),
  buildFa3Xml: (i: { invoice: { number: string; correctedKsefNumber: string | null } }) => {
    zbudowane.push({ number: i.invoice.number, correctedKsefNumber: i.invoice.correctedKsefNumber });
    return { xml: `<Faktura nr="${i.invoice.number}" korygowana="${i.invoice.correctedKsefNumber ?? 'NrKSeFN'}"/>` };
  },
}));
vi.mock('../billing/forma-zaplaty.js', () => ({ formaZaplatyFaktury: async () => ({ fa: undefined }) }));
const klienciV2: Array<{ baseUrl: string; wyslane: string[] }> = [];
let poOtwarciuSesji: (() => void) | null = null;
let bladOtwarcia: Error | null = null;
vi.mock('./ksef-v2.client.js', () => ({
  KsefV2Client: class {
    wyslane: string[] = [];
    constructor(public readonly cfg: { baseUrl: string }) {
      klienciV2.push({ baseUrl: cfg.baseUrl, wyslane: this.wyslane });
    }
    async openSession() {
      poOtwarciuSesji?.();
      if (bladOtwarcia) throw bladOtwarcia;
    }
    async sendInvoice(xml: string) { this.wyslane.push(xml); return { elementReferenceNumber: `sesja|f${this.wyslane.length}` }; }
    async invoiceStatus() { return { processed: false, ksefReferenceNumber: null, acquisitionTimestamp: null, statusCode: 150, statusDescription: null, rejected: false }; }
    async terminateSession() {}
  },
}));

type Row = Record<string, unknown> & { id: string };
function pasuje(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, w]) => {
    if (k === 'OR') return (w as Record<string, unknown>[]).some((s) => pasuje(row, s));
    const v = row[k];
    if (w && typeof w === 'object' && !(w instanceof Date)) {
      const o = w as Record<string, unknown>;
      if ('in' in o && !(o.in as unknown[]).includes(v)) return false;
      if ('lt' in o && !(v instanceof Date && v < (o.lt as Date))) return false;
      if ('gte' in o && !(v instanceof Date && v >= (o.gte as Date))) return false;
      if ('not' in o && v === o.not) return false;
      if ('startsWith' in o && !(typeof v === 'string' && v.startsWith(o.startsWith as string))) return false;
      return true;
    }
    return (v ?? null) === (w ?? null);
  });
}
function baza(rows: Row[]) {
  const wybierz = (r: Row | undefined) => (r ? { ...r } : null);
  return {
    rows,
    invoice: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
        rows.filter((r) => pasuje(r, where)).slice(0, take ?? 1e9).map((r) => ({ ...r })),
      findUnique: async ({ where }: { where: { id: string } }) => wybierz(rows.find((r) => r.id === where.id)),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => wybierz(rows.find((r) => r.id === where.id))!,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return { ...r };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const tr = rows.filter((r) => pasuje(r, where));
        tr.forEach((r) => Object.assign(r, data));
        return { count: tr.length };
      },
    },
  };
}
const ustawienia = { env: 'test' as 'test' | 'prod' };
const audyt: Array<{ action: string }> = [];
function serwis(db: ReturnType<typeof baza>) {
  const settings = { getKsefRuntimeConfig: async () => ({ enabled: true, env: ustawienia.env, nip: '5250000000', token: 't' }) };
  return new KsefService(db as never, { get: () => undefined } as never, { record: async (a: { action: string }) => void audyt.push(a) } as never, settings as never);
}
const faktura = (o: Partial<Row> & { id: string }): Row => ({
  number: `VFV/2026/10/${o.id}`, kind: 'FAKTURA', correctedId: null, rodzajPrawny: 'FAKTURA_VAT', issuedAt: new Date(), createdAt: new Date(),
  netAmount: 1, storageKey: 'k', userId: 'u', ksefStatus: KsefStatus.PENDING, ksefXml: null, ksefXmlSha256: null, ksefSrodowisko: null,
  ksefSubmittedAt: null, ksefElementRef: null, ksefNumber: null, ksefNiedostepnoscOd: null, ksefError: null, ...o,
});

beforeEach(() => {
  zbudowane.length = 0;
  klienciV2.length = 0;
  poOtwarciuSesji = null;
  bladOtwarcia = null;
  audyt.length = 0;
  ustawienia.env = 'test';
  vi.useRealTimers();
});

describe('KSeF — przegląd 15.10', () => {
  it('[1] nieudane otwarcie sesji w cyklu B nie cofa faktury, którą równoległy cykl A właśnie wysłał (SUBMITTED → OFFLINE → druga wysyłka)', async () => {
    const db = baza([faktura({ id: 'x' })]);
    const s = serwis(db);
    // Cykl B przeczytał X jako PENDING; zanim jego uwierzytelnienie padło, cykl A wysłał X.
    poOtwarciuSesji = () => {
      Object.assign(db.rows[0], { ksefStatus: KsefStatus.SUBMITTED, ksefElementRef: 'sesjaA|f1', ksefSubmittedAt: new Date() });
    };
    bladOtwarcia = new Error('KSeF 2.0 niedostępny (/auth/challenge): timeout');
    await s.tick();
    expect(db.rows[0].ksefStatus).toBe(KsefStatus.SUBMITTED);

    // 16 min później zwykły cykl: X nie może pójść do KSeF drugi raz.
    poOtwarciuSesji = null;
    bladOtwarcia = null;
    vi.useFakeTimers({ now: Date.now() + 16 * 60_000, toFake: ['Date'] });
    await serwis(db).tick();
    expect(klienciV2.flatMap((k) => k.wyslane)).toHaveLength(0);
  });

  it('[2] zmiana środowiska TEST→PROD w trakcie cyklu: ksefSrodowisko = środowisko, do którego plik faktycznie poszedł', async () => {
    const db = baza([faktura({ id: 'y' })]);
    // Admin zapisuje PROD, gdy cykl jest w uwierzytelnianiu (0 faktur SUBMITTED — strażnik w updateKsefSettings przepuszcza).
    poOtwarciuSesji = () => { ustawienia.env = 'prod'; };
    await serwis(db).tick();
    expect(klienciV2[0].baseUrl).toContain('api-test.ksef');
    expect(klienciV2[0].wyslane).toHaveLength(1);
    expect(db.rows[0].ksefSrodowisko).toBe('test');
  });

  it('[3] po przełączeniu na PROD korekta z plikiem zamrożonym w TEST (NrKSeFFaKorygowanej z TEST) nie idzie do KSeF PROD', async () => {
    ustawienia.env = 'prod';
    const db = baza([
      faktura({ id: 'o', ksefStatus: KsefStatus.ACCEPTED, ksefNumber: 'NUMER-Z-TEST', ksefSrodowisko: 'test' }),
      faktura({ id: 'k', number: 'VFK/2026/10/1', kind: 'KOREKTA', correctedId: 'o', ksefStatus: KsefStatus.OFFLINE,
        ksefXml: '<Faktura korygowana="NUMER-Z-TEST"/>', ksefXmlSha256: 'h', ksefSrodowisko: 'test' }),
    ]);
    await serwis(db).tick();
    expect(klienciV2[0].baseUrl).toContain('api.ksef.mf.gov.pl');
    expect(klienciV2[0].wyslane).toEqual([]);
  });

  it('[4] korekta faktury ODRZUCONEJ nie jest zamrażana z NrKSeFN, skoro pierwotna może jeszcze wejść do KSeF (retryInvoice)', async () => {
    const db = baza([
      faktura({ id: 'o', ksefStatus: KsefStatus.REJECTED, issuedAt: new Date(Date.now() - 1000) }),
      faktura({ id: 'k', number: 'VFK/2026/10/2', kind: 'KOREKTA', correctedId: 'o' }),
    ]);
    const s = serwis(db);
    await s.tick();
    // Pierwotna po poprawie danych wraca i dostaje numer — korekta w KSeF mówi „poza KSeF”.
    expect(zbudowane.find((b) => b.number === 'VFK/2026/10/2')).toBeUndefined();
  });
  it('[3b] PENDING z plikiem zamrożonym w TEST (bez korekty) po przełączeniu na PROD — plik budowany od nowa dla PROD', async () => {
    ustawienia.env = 'prod';
    const db = baza([faktura({ id: 'p', ksefXml: '<Faktura stara="test"/>', ksefXmlSha256: 'h', ksefSrodowisko: 'test' })]);
    await serwis(db).tick();
    expect(klienciV2[0].wyslane).toEqual(['<Faktura nr="VFV/2026/10/p" korygowana="NrKSeFN"/>']);
    expect(db.rows[0]).toMatchObject({ ksefStatus: KsefStatus.SUBMITTED, ksefSrodowisko: 'prod' });
    expect(db.rows[0].ksefXml).not.toContain('stara');
  });

  it('[3c] plik przyjęty w TEST zostaje bez zmian (PDF po przełączeniu nie przebudowuje faktury, która jest w KSeF)', async () => {
    ustawienia.env = 'prod';
    const db = baza([faktura({ id: 'a', ksefStatus: KsefStatus.ACCEPTED, ksefNumber: 'N', ksefXml: '<Faktura z="test"/>', ksefXmlSha256: 'h', ksefSrodowisko: 'test' })]);
    const plik = await serwis(db).zapewnijPlik(db.rows[0] as never);
    expect(plik).toEqual({ xml: '<Faktura z="test"/>', sha256: 'h', srodowisko: 'test' });
    expect(zbudowane).toEqual([]);
  });

  it('[6] odrzucony token (4xx z KSeF) to nie niedostępność: faktury zostają PENDING, bez trybu offline, wpis o odrzuceniu', async () => {
    const db = baza([faktura({ id: 't' })]);
    bladOtwarcia = Object.assign(new Error('KSeF 2.0 /auth/ksef-token nie powiódł się (HTTP 400)'), { httpStatus: 400 });
    await serwis(db).tick();
    expect(db.rows[0]).toMatchObject({ ksefStatus: KsefStatus.PENDING, ksefNiedostepnoscOd: null });
    expect(audyt.map((a) => a.action)).toEqual(['KSEF_UWIERZYTELNIENIE_ODRZUCONE']);
  });

  it('[6b] brak odpowiedzi KSeF (sieć) i 5xx dalej oznaczają niedostępność (M-16)', async () => {
    for (const blad of [new Error('KSeF 2.0 niedostępny (/auth/challenge): fetch failed'), Object.assign(new Error('HTTP 503'), { httpStatus: 503 })]) {
      const db = baza([faktura({ id: 'n' })]);
      bladOtwarcia = blad;
      audyt.length = 0;
      await serwis(db).tick();
      expect(db.rows[0].ksefStatus).toBe(KsefStatus.OFFLINE);
      expect(audyt.map((a) => a.action)).toEqual(['KSEF_NIEDOSTEPNOSC']);
    }
  });

  it('[1b] niedostępność nie oznacza faktury, którą równoległy cykl właśnie wysyła (dzierżawa)', async () => {
    const db = baza([faktura({ id: 'd', ksefSubmittedAt: new Date(Date.now() - 60_000) })]);
    bladOtwarcia = new Error('KSeF 2.0 niedostępny (/auth/challenge): timeout');
    await serwis(db).tick();
    expect(db.rows[0].ksefStatus).toBe(KsefStatus.PENDING);
  });
});
