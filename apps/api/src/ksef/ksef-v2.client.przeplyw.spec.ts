import {
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  sign,
  constants as cryptoConstants,
  type KeyObject,
} from 'node:crypto';
import { KsefV2ApiError, KsefV2Client } from './ksef-v2.client.js';
import { FA3_FORM_VALUE, FA3_SCHEMA_VERSION, FA3_SYSTEM_CODE } from './fa3-xml.builder.js';

/**
 * X-07 — pokrycie klienta KSeF 2.0 (od decyzji 12.10 panel sam wysyła faktury do KSeF).
 *
 * Atrapa KSeF na podmienionym `fetch` z PRAWDZIWĄ kryptografią: klucze RSA i certyfikaty MF
 * generowane w teście, atrapa odszyfrowuje token (RSA-OAEP-SHA256), klucz symetryczny i fakturę
 * (AES-256-CBC) — tak jak robi to KSeF wg dokumentacji MF (github.com/CIRFMF/ksef-docs,
 * „uwierzytelnianie” i „sesja interaktywna”). Błąd w algorytmie, w wyborze certyfikatu, w skrótach
 * albo w rozmiarze (bajty, nie znaki) wychodzi tutaj, a nie dopiero na api-test.
 */

const BAZA = 'https://api-test.ksef.mf.gov.pl/api/v2';
const NIP = '5250000000';
const TOKEN = '20251010-EC-0000000000-0000000000-AB|nip-5250000000|tajny';
const GODZINA = 3600_000;

/** Certyfikat samopodpisany X.509 v3 (bez rozszerzeń) — jak w ssl.service.spec.ts. */
function certyfikat(klucz: KeyObject, od: Date, do_: Date): string {
  const d = (tag: number, body: Buffer) => {
    const n = body.length;
    return Buffer.concat([Buffer.from([tag, ...(n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff])]), body]);
  };
  const alg = Buffer.from('300d06092a864886f70d01010b0500', 'hex');
  const nazwa = d(0x30, d(0x31, d(0x30, Buffer.concat([Buffer.from('0603550403', 'hex'), d(0x0c, Buffer.from('KSeF test'))]))));
  const czas = (t: Date) => d(0x17, Buffer.from(t.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
  const tbs = d(0x30, Buffer.concat([
    d(0xa0, Buffer.from([0x02, 0x01, 0x02])), Buffer.from([0x02, 0x01, 0x01]), alg, nazwa,
    d(0x30, Buffer.concat([czas(od), czas(do_)])),
    nazwa, createPublicKey(klucz).export({ type: 'spki', format: 'der' }),
  ]));
  return d(0x30, Buffer.concat([tbs, alg, d(0x03, Buffer.concat([Buffer.from([0]), sign('sha256', tbs, klucz)]))])).toString('base64');
}

function para() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
}

const rsaOdszyfruj = (klucz: KeyObject, b64: string) =>
  privateDecrypt({ key: klucz, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(b64, 'base64'));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('base64');

// Klucze generowane raz — RSA 2048 to kilkadziesiąt ms na parę.
const kTokenu = para();
const kSymetrii = para();
const kStary = para();
const kPrzyszly = para();

interface Zapis {
  metoda: string;
  sciezka: string;
  auth: string | null;
  body: Record<string, unknown> | null;
}

/** Atrapa KSeF. `nadpisz` pozwala podmienić odpowiedź dla ścieżki (wzorzec), reszta jak w dokumentacji. */
function atrapa(nadpisz: Record<string, (z: Zapis) => Response> = {}) {
  const zapisy: Zapis[] = [];
  const stan = { klucz: null as Buffer | null, iv: null as Buffer | null, faktury: [] as string[], pollStatusy: [100, 200] };
  const teraz = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const certy = [
    // Wygasły klucz do tokenu (inny klucz prywatny, NOWSZY validFrom niż ważny) — wybór go = token, którego KSeF nie odszyfruje.
    { certificate: certyfikat(kStary, new Date(teraz - 2 * GODZINA), new Date(teraz - GODZINA)), certificateId: 'c-stary', publicKeyId: 'pk-stary', validFrom: iso(teraz - 2 * GODZINA), validTo: iso(teraz - GODZINA), usage: ['KsefTokenEncryption'] },
    { certificate: certyfikat(kTokenu, new Date(teraz - 24 * GODZINA), new Date(teraz + 365 * 24 * GODZINA)), certificateId: 'c-token', publicKeyId: 'pk-token', validFrom: iso(teraz - 24 * GODZINA), validTo: iso(teraz + 365 * 24 * GODZINA), usage: ['KsefTokenEncryption'] },
    // Ważny dopiero w przyszłości — nie wolno go wybrać mimo najnowszego validFrom.
    { certificate: certyfikat(kPrzyszly, new Date(teraz + 24 * GODZINA), new Date(teraz + 800 * 24 * GODZINA)), certificateId: 'c-przyszly', publicKeyId: 'pk-przyszly', validFrom: iso(teraz + 24 * GODZINA), validTo: iso(teraz + 800 * 24 * GODZINA), usage: ['KsefTokenEncryption', 'SymmetricKeyEncryption'] },
    { certificate: certyfikat(kSymetrii, new Date(teraz - 24 * GODZINA), new Date(teraz + 365 * 24 * GODZINA)), certificateId: 'c-sym', publicKeyId: 'pk-sym', validFrom: iso(teraz - 24 * GODZINA), validTo: iso(teraz + 365 * 24 * GODZINA), usage: ['SymmetricKeyEncryption'] },
  ];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchAtrapa = vi.fn(async (url: string, init: RequestInit = {}) => {
    const sciezka = url.slice(BAZA.length);
    const naglowki = new Headers(init.headers);
    const z: Zapis = {
      metoda: init.method ?? 'GET',
      sciezka,
      auth: naglowki.get('Authorization'),
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    zapisy.push(z);
    for (const [wzorzec, f] of Object.entries(nadpisz)) if (new RegExp(wzorzec).test(sciezka)) return f(z);

    if (sciezka === '/security/public-key-certificates') return json(200, certy);
    // Znacznik czasu z 7 cyframi ułamka i strefą — tak zwraca KSeF (przykład z dokumentacji).
    if (sciezka === '/auth/challenge') return json(200, { challenge: '20251015-CR-1', timestamp: '2025-07-11T12:23:56.0154302+00:00' });
    if (sciezka === '/auth/ksef-token') return json(202, { referenceNumber: 'auth-ref-1', authenticationToken: { token: 'tok-auth', validUntil: iso(teraz + GODZINA) } });
    if (sciezka === '/auth/auth-ref-1') return json(200, { status: { code: stan.pollStatusy.shift() ?? 200, description: 'x' } });
    if (sciezka === '/auth/token/redeem') return json(200, { accessToken: { token: 'tok-dostep', validUntil: iso(teraz + GODZINA) }, refreshToken: { token: 'tok-odsw' } });
    if (sciezka === '/sessions/online') {
      const enc = z.body!.encryption as { encryptedSymmetricKey: string; initializationVector: string };
      stan.klucz = rsaOdszyfruj(kSymetrii, enc.encryptedSymmetricKey);
      stan.iv = Buffer.from(enc.initializationVector, 'base64');
      return json(201, { referenceNumber: 'sesja-1', validUntil: iso(teraz + GODZINA) });
    }
    if (sciezka === '/sessions/online/sesja-1/invoices') {
      const d = createDecipheriv('aes-256-cbc', stan.klucz!, stan.iv!);
      const tresc = Buffer.from(z.body!.encryptedInvoiceContent as string, 'base64');
      const jawny = Buffer.concat([d.update(tresc), d.final()]);
      // Weryfikacja jak po stronie KSeF: skróty i rozmiary obu postaci pliku.
      if (sha(jawny) !== z.body!.invoiceHash || jawny.length !== z.body!.invoiceSize) return json(400, { exception: { exceptionDetailList: [{ exceptionCode: 21155 }] } });
      if (sha(tresc) !== z.body!.encryptedInvoiceHash || tresc.length !== z.body!.encryptedInvoiceSize) return json(400, { exception: { exceptionDetailList: [{ exceptionCode: 21156 }] } });
      stan.faktury.push(jawny.toString('utf8'));
      return json(202, { referenceNumber: `fakt-${stan.faktury.length}` });
    }
    if (sciezka === '/sessions/online/sesja-1/close') return new Response(null, { status: 204 });
    return json(404, { blad: sciezka });
  });
  vi.stubGlobal('fetch', fetchAtrapa);
  return { zapisy, stan, fetchAtrapa };
}

function klient() {
  const c = new KsefV2Client({ baseUrl: `${BAZA}/`, nip: NIP, token: TOKEN });
  // Odpytywanie statusu uwierzytelnienia czeka 1,5 s między próbami — w teście bez czekania.
  (c as unknown as { delay: () => Promise<void> }).delay = async () => undefined;
  return c;
}

afterEach(() => vi.unstubAllGlobals());

describe('X-07 — KsefV2Client: pełny przepływ na atrapie KSeF z prawdziwą kryptografią', () => {
  it('uwierzytelnienie tokenem: ważny certyfikat wg usage, token|timestampMs w RSA-OAEP-SHA256, kontekst NIP, Bearer w odpytywaniu i redeem', async () => {
    const { zapisy } = atrapa();
    await klient().openSession();

    expect(zapisy.map((z) => `${z.metoda} ${z.sciezka}`)).toEqual([
      'GET /security/public-key-certificates',
      'POST /auth/challenge',
      'POST /auth/ksef-token',
      'GET /auth/auth-ref-1',
      'GET /auth/auth-ref-1',
      'POST /auth/token/redeem',
    ]);
    const zgloszenie = zapisy[2].body!;
    expect(zgloszenie).toMatchObject({ challenge: '20251015-CR-1', contextIdentifier: { type: 'Nip', value: NIP }, publicKeyId: 'pk-token' });
    // Odszyfrowuje się kluczem certyfikatu ważnego teraz (nie wygasłego ani przyszłego).
    expect(rsaOdszyfruj(kTokenu, zgloszenie.encryptedToken as string).toString('utf8')).toBe(`${TOKEN}|1752236636015`);
    expect(zapisy[1].body).toBeNull(); // /auth/challenge bez body (open-api.json)
    expect(zapisy[3].auth).toBe('Bearer tok-auth');
    expect(zapisy[5].auth).toBe('Bearer tok-auth');
  });

  it('wysyłka: jedna sesja online na partię, klucz AES w RSA-OAEP certyfikatem do symetrii, plik odszyfrowuje się do tego samego XML (rozmiar w bajtach UTF-8)', async () => {
    const { zapisy, stan } = atrapa();
    const c = klient();
    await c.openSession();
    const xml1 = '<?xml version="1.0" encoding="UTF-8"?><Faktura><P_2>FV/1/10/2026</P_2><Nazwa>Zażółć gęślą jaźń sp. z o.o.</Nazwa></Faktura>';
    const xml2 = '<Faktura><P_2>FV/2/10/2026</P_2></Faktura>';
    await expect(c.sendInvoice(xml1)).resolves.toEqual({ elementReferenceNumber: 'sesja-1|fakt-1' });
    await expect(c.sendInvoice(xml2)).resolves.toEqual({ elementReferenceNumber: 'sesja-1|fakt-2' });
    await c.terminateSession();

    expect(stan.faktury).toEqual([xml1, xml2]);
    expect(stan.klucz).toHaveLength(32);
    expect(stan.iv).toHaveLength(16);
    const otwarcia = zapisy.filter((z) => z.sciezka === '/sessions/online');
    expect(otwarcia).toHaveLength(1);
    expect(otwarcia[0].body).toEqual({
      formCode: { systemCode: FA3_SYSTEM_CODE, schemaVersion: FA3_SCHEMA_VERSION, value: FA3_FORM_VALUE },
      encryption: { encryptedSymmetricKey: expect.any(String), initializationVector: expect.any(String), publicKeyId: 'pk-sym' },
    });
    const wysylki = zapisy.filter((z) => z.sciezka.endsWith('/invoices'));
    expect(wysylki.every((z) => z.auth === 'Bearer tok-dostep')).toBe(true);
    // Rozmiar w bajtach, nie w znakach — polskie litery zajmują 2 bajty.
    expect(wysylki[0].body!.invoiceSize).toBe(Buffer.byteLength(xml1, 'utf8'));
    expect(wysylki[0].body!.invoiceSize).toBeGreaterThan(xml1.length);
    // Zamknięcie sesji (wyzwala UPO) z tokenem dostępu.
    const zamkniecie = zapisy.at(-1)!;
    expect(`${zamkniecie.metoda} ${zamkniecie.sciezka}`).toBe('POST /sessions/online/sesja-1/close');
    expect(zamkniecie.auth).toBe('Bearer tok-dostep');
  });

  it('po terminateSession stan wyczyszczony: status/UPO bez ponownego openSession → błąd bez wywołania KSeF', async () => {
    const { fetchAtrapa } = atrapa();
    const c = klient();
    await c.openSession();
    await c.sendInvoice('<Faktura/>');
    await c.terminateSession();
    const przed = fetchAtrapa.mock.calls.length;
    await expect(c.invoiceStatus('sesja-1|fakt-1')).rejects.toThrow(/Brak accessToken/);
    await expect(c.downloadUpo('sesja-1|fakt-1')).rejects.toThrow(/Brak accessToken/);
    await expect(c.sendInvoice('<Faktura/>')).rejects.toThrow(/Brak uwierzytelnienia/);
    expect(fetchAtrapa.mock.calls.length).toBe(przed);
  });

  it('terminateSession bez otwartej sesji online nie woła KSeF', async () => {
    const { zapisy } = atrapa();
    const c = klient();
    await c.openSession();
    const przed = zapisy.length;
    await c.terminateSession();
    expect(zapisy.length).toBe(przed);
  });

  it('uwierzytelnienie odrzucone (status 4xx w odpytywaniu) — błąd z opisem, bez redeem', async () => {
    const { zapisy, stan } = atrapa();
    stan.pollStatusy = [100, 450];
    const err = await klient().openSession().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KsefV2ApiError);
    expect((err as Error).message).toMatch(/uwierzytelnianie odrzucone/);
    expect(zapisy.some((z) => z.sciezka === '/auth/token/redeem')).toBe(false);
  });

  it('uwierzytelnienie bez rozstrzygnięcia — po 20 próbach błąd (nie nieskończona pętla)', async () => {
    const { zapisy, stan } = atrapa();
    stan.pollStatusy = Array.from({ length: 50 }, () => 100);
    await expect(klient().openSession()).rejects.toThrow(/przekroczono czas oczekiwania/);
    expect(zapisy.filter((z) => z.sciezka === '/auth/auth-ref-1')).toHaveLength(20);
  });

  it('brak ważnego certyfikatu dla symetrii — błąd przed wysłaniem tokenu', async () => {
    const { zapisy } = atrapa({
      '^/security/public-key-certificates$': () =>
        new Response(JSON.stringify([{ certificate: certyfikat(kTokenu, new Date(Date.now() - GODZINA), new Date(Date.now() + GODZINA)), certificateId: 'c', publicKeyId: 'pk', validFrom: new Date(Date.now() - GODZINA).toISOString(), validTo: new Date(Date.now() + GODZINA).toISOString(), usage: ['KsefTokenEncryption'] }]), { status: 200 }),
    });
    await expect(klient().openSession()).rejects.toThrow(/usage=SymmetricKeyEncryption/);
    expect(zapisy.map((z) => z.sciezka)).toEqual(['/security/public-key-certificates']);
  });

  it('KSeF nieosiągalny (sieć) — KsefV2ApiError bez httpStatus (serwis zostawia fakturę do ponowienia)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const err = await klient().openSession().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KsefV2ApiError);
    expect((err as KsefV2ApiError).httpStatus).toBeUndefined();
    expect((err as Error).message).toMatch(/niedostępny \(\/security\/public-key-certificates\)/);
  });
});

describe('X-07 — KsefV2Client: status faktury i UPO', () => {
  async function zalogowany(nadpisz: Record<string, (z: Zapis) => Response>) {
    const a = atrapa(nadpisz);
    const c = klient();
    await c.openSession();
    return { c, ...a };
  }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('przyjęta: numer KSeF i data przyjęcia (acquisitionDate), zapytanie o fakturę w jej sesji z tokenem dostępu', async () => {
    const { c, zapisy } = await zalogowany({
      '^/sessions/sesja-9/invoices/fakt-3$': () => json(200, { ksefNumber: '5250000000-20251015-0100A0B0C0D0-E1', acquisitionDate: '2025-10-15T10:00:00+00:00', status: { code: 200, description: 'Sukces' } }),
    });
    await expect(c.invoiceStatus('sesja-9|fakt-3')).resolves.toEqual({
      processed: true,
      ksefReferenceNumber: '5250000000-20251015-0100A0B0C0D0-E1',
      acquisitionTimestamp: '2025-10-15T10:00:00+00:00',
      statusCode: 200,
      statusDescription: 'Sukces',
      rejected: false,
    });
    expect(zapisy.at(-1)).toMatchObject({ metoda: 'GET', sciezka: '/sessions/sesja-9/invoices/fakt-3', auth: 'Bearer tok-dostep' });
  });

  it('w przetwarzaniu (150): ani przyjęta, ani odrzucona', async () => {
    const { c } = await zalogowany({ '/invoices/fakt-3$': () => json(200, { status: { code: 150, description: 'Trwa przetwarzanie' } }) });
    await expect(c.invoiceStatus('s|fakt-3')).resolves.toMatchObject({ processed: false, rejected: false, ksefReferenceNumber: null, statusCode: 150 });
  });

  it('błąd weryfikacji (450): odrzucona z kodem i opisem z KSeF', async () => {
    const { c } = await zalogowany({ '/invoices/fakt-3$': () => json(200, { status: { code: 450, description: 'Błąd weryfikacji semantyki dokumentu faktury' } }) });
    await expect(c.invoiceStatus('s|fakt-3')).resolves.toMatchObject({ processed: false, rejected: true, statusCode: 450, statusDescription: 'Błąd weryfikacji semantyki dokumentu faktury' });
  });

  it('HTTP błąd przy statusie — KsefV2ApiError z httpStatus i treścią', async () => {
    const { c } = await zalogowany({ '/invoices/fakt-3$': () => json(401, { title: 'Unauthorized' }) });
    const err = await c.invoiceStatus('s|fakt-3').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KsefV2ApiError);
    expect((err as KsefV2ApiError).httpStatus).toBe(401);
    expect((err as KsefV2ApiError).body).toEqual({ title: 'Unauthorized' });
  });

  it('identyfikator bez sesji albo bez faktury — błąd bez wywołania KSeF', async () => {
    const { c, fetchAtrapa } = await zalogowany({});
    const przed = fetchAtrapa.mock.calls.length;
    await expect(c.invoiceStatus('fakt-3')).rejects.toThrow(/Nieprawidłowy identyfikator/);
    await expect(c.downloadUpo('sesja-1|')).rejects.toThrow(/Nieprawidłowy identyfikator/);
    expect(fetchAtrapa.mock.calls.length).toBe(przed);
  });

  it('UPO: XML z KSeF bez zmian; błąd HTTP z kodem i treścią', async () => {
    const upo = '<?xml version="1.0"?><Potwierdzenie><NumerKSeFDokumentu>5250000000-20251015-X</NumerKSeFDokumentu></Potwierdzenie>';
    const { c, zapisy } = await zalogowany({
      '^/sessions/sesja-1/invoices/fakt-1/upo$': () => new Response(upo, { status: 200, headers: { 'Content-Type': 'application/xml' } }),
      '^/sessions/sesja-1/invoices/fakt-2/upo$': () => new Response('brak UPO', { status: 404 }),
    });
    await expect(c.downloadUpo('sesja-1|fakt-1')).resolves.toBe(upo);
    expect(zapisy.at(-1)).toMatchObject({ metoda: 'GET', auth: 'Bearer tok-dostep' });
    const err = await c.downloadUpo('sesja-1|fakt-2').catch((e: unknown) => e);
    expect((err as KsefV2ApiError).httpStatus).toBe(404);
    expect((err as KsefV2ApiError).body).toBe('brak UPO');
  });
});
