import { createPrivateKey, privateDecrypt, verify, X509Certificate, constants as c } from 'node:crypto';
import { certyfikatTestowy } from '../test/certyfikat-ksef-testowy.js';
import { KsefV2ApiError, KsefV2Client, type PamiecTokenowKsef } from './ksef-v2.client.js';

/**
 * KSeF 07.11 — klient KSeF 2.0: uwierzytelnienie certyfikatem (POST /auth/xades-signature, uwierzytelnianie.md
 * 2.1), odświeżanie accessToken refreshTokenem (pkt 5), `offlineMode`/`hashOfCorrectedInvoice` (tryby-offline.md,
 * offline/korekta-techniczna.md), duplikat 440 i lista faktur sesji (open-api.json), 429 + Retry-After
 * (limity/limity-api.md). Atrapa KSeF na podmienionym fetch; podpis XAdES sprawdzany kluczem z KeyInfo.
 */

const BAZA = 'https://api-test.ksef.mf.gov.pl/api/v2';
const NIP = '9292069367';
const CHALLENGE = '20261107-CR-20F5EE4000-DA48AE4124-46';
const MIN = 60_000;

const mf = certyfikatTestowy(); // klucz MF do szyfrowania klucza symetrycznego sesji
const wlasny = certyfikatTestowy({ algorytm: 'EC' }); // certyfikat KSeF (Authentication) podatnika

interface Zapis {
  metoda: string;
  sciezka: string;
  auth: string | null;
  typ: string | null;
  tekst: string | null;
  naglowki: Headers;
}

function atrapa(o: { accessWazny?: number; refreshOdpowiedz?: () => Response; nadpisz?: Record<string, (z: Zapis) => Response> } = {}) {
  const zapisy: Zapis[] = [];
  const teraz = Date.now();
  const json = (status: number, body: unknown, h: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...h } });
  let numerTokenu = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const sciezka = url.slice(BAZA.length);
      const naglowki = new Headers(init.headers);
      const z: Zapis = { metoda: init.method ?? 'GET', sciezka, auth: naglowki.get('Authorization'), typ: naglowki.get('Content-Type'), tekst: typeof init.body === 'string' ? init.body : null, naglowki };
      zapisy.push(z);
      for (const [w, f] of Object.entries(o.nadpisz ?? {})) if (new RegExp(w).test(sciezka)) return f(z);
      if (sciezka === '/security/public-key-certificates') {
        return json(200, [{ certificate: mf.derB64, certificateId: 'c', publicKeyId: 'pk-sym', validFrom: new Date(teraz - MIN).toISOString(), validTo: new Date(teraz + 100 * MIN).toISOString(), usage: ['SymmetricKeyEncryption'] }]);
      }
      if (sciezka === '/auth/challenge') return json(200, { challenge: CHALLENGE, timestamp: new Date(teraz).toISOString() });
      if (sciezka === '/auth/xades-signature') {
        // Jak KSeF: podpis XAdES weryfikowany kluczem certyfikatu z KeyInfo.
        const xml = z.tekst!;
        const cert = new X509Certificate(Buffer.from(/<ds:X509Certificate>([^<]+)</.exec(xml)![1], 'base64'));
        const si = /<ds:SignedInfo[\s\S]*?<\/ds:SignedInfo>/.exec(xml)![0];
        const sv = Buffer.from(/<ds:SignatureValue>([^<]+)</.exec(xml)![1], 'base64');
        const ok = verify('sha256', Buffer.from(si), { key: cert.publicKey, dsaEncoding: 'ieee-p1363' }, sv);
        if (!ok || !xml.includes(`<Challenge>${CHALLENGE}</Challenge>`) || !xml.includes(`<Nip>${NIP}</Nip>`)) {
          return json(400, { exception: { exceptionDetailList: [{ exceptionCode: 9105 }] } });
        }
        return json(202, { referenceNumber: 'auth-x', authenticationToken: { token: 'tok-op', validUntil: new Date(teraz + MIN).toISOString() } });
      }
      if (sciezka === '/auth/auth-x') return json(200, { status: { code: 200, description: 'ok' } });
      if (sciezka === '/auth/token/redeem') {
        numerTokenu += 1;
        return json(200, {
          accessToken: { token: `acc-${numerTokenu}`, validUntil: new Date(teraz + (o.accessWazny ?? 15 * MIN)).toISOString() },
          refreshToken: { token: 'ref-1', validUntil: new Date(teraz + 7 * 24 * 60 * MIN).toISOString() },
        });
      }
      if (sciezka === '/auth/token/refresh') {
        return o.refreshOdpowiedz?.() ?? json(200, { accessToken: { token: 'acc-odswiezony', validUntil: new Date(teraz + 15 * MIN).toISOString() } });
      }
      if (sciezka === '/sessions/online') {
        const enc = JSON.parse(z.tekst!).encryption as { encryptedSymmetricKey: string };
        privateDecrypt({ key: createPrivateKey(mf.kluczPem), padding: c.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(enc.encryptedSymmetricKey, 'base64'));
        return json(201, { referenceNumber: 'sesja-1' });
      }
      if (sciezka === '/sessions/online/sesja-1/invoices') return json(202, { referenceNumber: 'f-1' });
      if (sciezka === '/sessions/online/sesja-1/close') return new Response(null, { status: 204 });
      return json(404, {});
    }),
  );
  return zapisy;
}

const klient = (pamiec?: PamiecTokenowKsef) =>
  new KsefV2Client({
    baseUrl: BAZA,
    nip: NIP,
    uwierzytelnienie: { metoda: 'certyfikat', certyfikatPem: wlasny.certPem, kluczPem: wlasny.kluczPem, typIdentyfikatora: 'certificateSubject' },
    pamiec,
  });

afterEach(() => vi.unstubAllGlobals());

describe('KsefV2Client – uwierzytelnienie certyfikatem KSeF (XAdES)', () => {
  it('challenge → POST /auth/xades-signature (application/xml, podpis weryfikowalny) → status → redeem; bez klucza do tokenu', async () => {
    const zapisy = atrapa();
    await klient().openSession();
    expect(zapisy.map((z) => `${z.metoda} ${z.sciezka}`)).toEqual([
      'GET /security/public-key-certificates',
      'POST /auth/challenge',
      'POST /auth/xades-signature',
      'GET /auth/auth-x',
      'POST /auth/token/redeem',
    ]);
    const xades = zapisy[2];
    expect(xades.typ).toBe('application/xml');
    expect(xades.tekst).toContain('<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>');
    expect(zapisy[3].auth).toBe('Bearer tok-op');
  });

  it('podpis odrzucony przez KSeF (9105): błąd z polskim opisem i kodem HTTP (nie „niedostępność”)', async () => {
    atrapa({ nadpisz: { '^/auth/xades-signature$': () => new Response(JSON.stringify({ exception: { exceptionDetailList: [{ exceptionCode: 9105 }] } }), { status: 400 }) } });
    const err = (await klient().openSession().catch((e: unknown) => e)) as KsefV2ApiError;
    expect(err.httpStatus).toBe(400);
    expect(err.message).toMatch(/Nieprawidłowy podpis/);
  });

  it('status uwierzytelnienia 460 (certyfikat) – komunikat dla operatora; 550 – bez httpStatus (spróbuj później)', async () => {
    atrapa({ nadpisz: { '^/auth/auth-x$': () => new Response(JSON.stringify({ status: { code: 460, description: 'x' } }), { status: 200 }) } });
    expect(((await klient().openSession().catch((e: unknown) => e)) as Error).message).toMatch(/Certyfikat odrzucony/);
    atrapa({ nadpisz: { '^/auth/auth-x$': () => new Response(JSON.stringify({ status: { code: 550, description: 'x' } }), { status: 200 }) } });
    expect(((await klient().openSession().catch((e: unknown) => e)) as KsefV2ApiError).httpStatus).toBeUndefined();
  });
});

describe('KsefV2Client – pamięć tokenów i odświeżanie (uwierzytelnianie.md pkt 4–5)', () => {
  it('ważny accessToken z pamięci: kolejny cykl bez uwierzytelnienia', async () => {
    const pamiec: PamiecTokenowKsef = { tokeny: null };
    atrapa();
    await klient(pamiec).openSession();
    const zapisy = atrapa();
    await klient(pamiec).openSession();
    expect(zapisy.map((z) => z.sciezka)).toEqual(['/security/public-key-certificates']);
  });

  it('accessToken wygasa: POST /auth/token/refresh z Bearer refreshToken, nowy token w pamięci', async () => {
    const pamiec: PamiecTokenowKsef = { tokeny: null };
    atrapa({ accessWazny: MIN }); // poniżej zapasu 2 min
    await klient(pamiec).openSession();
    const zapisy = atrapa();
    const k = klient(pamiec);
    await k.openSession();
    expect(zapisy.map((z) => z.sciezka)).toEqual(['/security/public-key-certificates', '/auth/token/refresh']);
    expect(zapisy[1].auth).toBe('Bearer ref-1');
    expect(pamiec.tokeny?.accessToken).toBe('acc-odswiezony');
  });

  it('odmowa odświeżenia (400): pełne uwierzytelnienie; niedostępność przy odświeżaniu: błąd bez ponownego logowania', async () => {
    const pamiec: PamiecTokenowKsef = { tokeny: null };
    atrapa({ accessWazny: MIN });
    await klient(pamiec).openSession();
    let zapisy = atrapa({ refreshOdpowiedz: () => new Response(JSON.stringify({ exception: { exceptionDetailList: [{ exceptionCode: 21301 }] } }), { status: 400 }) });
    await klient(pamiec).openSession();
    expect(zapisy.map((z) => z.sciezka)).toContain('/auth/xades-signature');

    pamiec.tokeny = { ...pamiec.tokeny!, accessDo: Date.now() };
    zapisy = atrapa({ refreshOdpowiedz: () => new Response('x', { status: 503 }) });
    await expect(klient(pamiec).openSession()).rejects.toThrow(/refresh/);
    expect(zapisy.map((z) => z.sciezka)).not.toContain('/auth/xades-signature');
  });
});

describe('KsefV2Client – wysyłka offline, duplikat, lista faktur sesji, 429', () => {
  it('offlineMode i hashOfCorrectedInvoice trafiają do żądania wysyłki (SendInvoiceRequest); domyślnie ich brak', async () => {
    const zapisy = atrapa();
    const k = klient();
    await k.openSession();
    await k.sendInvoice('<Faktura/>');
    await k.sendInvoice('<Faktura/>', { offlineMode: true, hashOfCorrectedInvoice: 'AAAA' });
    const wysylki = zapisy.filter((z) => z.sciezka.endsWith('/invoices')).map((z) => JSON.parse(z.tekst!));
    expect(wysylki[0]).not.toHaveProperty('offlineMode');
    expect(wysylki[1]).toMatchObject({ offlineMode: true, hashOfCorrectedInvoice: 'AAAA' });
  });

  it('status 440: duplikat z numerem KSeF i sesją pierwotnej (rozszerzenia statusu)', async () => {
    atrapa({
      nadpisz: {
        '^/sessions/s2/invoices/f2$': () =>
          new Response(JSON.stringify({ status: { code: 440, description: 'Duplikat faktury', details: ['Duplikat faktury.'], extensions: { originalSessionReferenceNumber: 's1', originalKsefNumber: '9292069367-20261107-0100001AF629-AF' } } }), { status: 200 }),
      },
    });
    const k = klient();
    await k.openSession();
    await expect(k.invoiceStatus('s2|f2')).resolves.toMatchObject({
      rejected: true,
      statusCode: 440,
      duplikat: { numerKsef: '9292069367-20261107-0100001AF629-AF', sesja: 's1' },
      szczegoly: ['Duplikat faktury.'],
    });
  });

  it('fakturaWSesji: stronicowanie x-continuation-token, skrót i data przyjęcia szukanej faktury', async () => {
    const zapisy = atrapa({
      nadpisz: {
        '^/sessions/s1/invoices\\?pageSize=1000$': (z) =>
          z.naglowki.get('x-continuation-token')
            ? new Response(JSON.stringify({ invoices: [{ ksefNumber: 'N-2', invoiceHash: 'SKROT', acquisitionDate: '2026-11-07T10:00:00Z' }] }), { status: 200 })
            : new Response(JSON.stringify({ continuationToken: 'dalej', invoices: [{ ksefNumber: 'N-1', invoiceHash: 'X' }] }), { status: 200 }),
      },
    });
    const k = klient();
    await k.openSession();
    await expect(k.fakturaWSesji('s1', 'N-2')).resolves.toEqual({ skrotB64: 'SKROT', przyjeto: '2026-11-07T10:00:00Z' });
    expect(zapisy.filter((z) => z.sciezka.startsWith('/sessions/s1/invoices'))).toHaveLength(2);
    await expect(k.fakturaWSesji('s1', 'N-9')).resolves.toBeNull();
  });

  it('429: błąd przejściowy z Retry-After (limity/limity-api.md), nie „wynik niepewny”', async () => {
    atrapa({ nadpisz: { '^/sessions/online/sesja-1/invoices$': () => new Response('{}', { status: 429, headers: { 'Retry-After': '45' } }) } });
    const k = klient();
    await k.openSession();
    const err = (await k.sendInvoice('<Faktura/>').catch((e: unknown) => e)) as KsefV2ApiError;
    expect([err.httpStatus, err.przejsciowy, err.niepewny, err.retryAfterS]).toEqual([429, true, false, 45]);
  });

  it('brak połączenia (ECONNREFUSED) przy wysyłce: żądanie nie wyszło – przejściowy, nie niepewny', async () => {
    atrapa({
      nadpisz: {
        '^/sessions/online/sesja-1/invoices$': () => {
          throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
        },
      },
    });
    const k = klient();
    await k.openSession();
    const err = (await k.sendInvoice('<Faktura/>').catch((e: unknown) => e)) as KsefV2ApiError;
    expect([err.niepewny, err.przejsciowy]).toEqual([false, true]);
  });
});
