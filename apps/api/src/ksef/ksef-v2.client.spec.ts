import { randomBytes } from 'node:crypto';
import { KsefV2ApiError, KsefV2Client } from './ksef-v2.client.js';

/**
 * API 2.8.0 (PRD 23.09.2026): wysyłka w sesji interaktywnej może zwrócić 400 + kod 21184
 * „Sesja tymczasowo niedostępna” — zalecenie MF: otworzyć nową sesję i kontynuować.
 * Wcześniej taka odpowiedź kończyła się odrzuceniem poprawnej faktury (REJECTED).
 */
const blad21184 = { exception: { exceptionDetailList: [{ exceptionCode: 21184, exceptionDescription: 'Sesja tymczasowo niedostępna.' }] } };

function klient() {
  const c = new KsefV2Client({ baseUrl: 'https://api-test.ksef.mf.gov.pl/api/v2', nip: '5250000000', token: 't' } as never);
  const otwarte: string[] = [];
  const wnetrze = c as unknown as Record<string, unknown>;
  wnetrze.accessToken = 'acc';
  // Otwarcie sesji online (szyfrowanie klucza RSA) testuje smoke na api-test; tu liczymy otwarcia.
  wnetrze.ensureOnlineSession = async () => {
    if (wnetrze.sessionRef) return;
    wnetrze.sessionRef = `sesja-${otwarte.length + 1}`;
    wnetrze.cipherKey = randomBytes(32);
    wnetrze.cipherIv = randomBytes(16);
    otwarte.push(wnetrze.sessionRef as string);
  };
  return { c, otwarte };
}

const odpowiedz = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('KsefV2Client.sendInvoice — kod 21184 (API 2.8.0)', () => {
  it('21184: otwiera nową sesję i wysyła w niej fakturę', async () => {
    const adresy: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      adresy.push(url);
      return adresy.length === 1 ? odpowiedz(400, blad21184) : odpowiedz(202, { referenceNumber: 'fakt-1' });
    }));
    const { c, otwarte } = klient();
    await expect(c.sendInvoice('<Faktura/>')).resolves.toEqual({ elementReferenceNumber: 'sesja-2|fakt-1' });
    expect(otwarte).toEqual(['sesja-1', 'sesja-2']);
    expect(adresy).toEqual([
      'https://api-test.ksef.mf.gov.pl/api/v2/sessions/online/sesja-1/invoices',
      'https://api-test.ksef.mf.gov.pl/api/v2/sessions/online/sesja-2/invoices',
    ]);
  });

  it('21184 drugi raz: błąd przejściowy (faktura czeka na kolejny cykl), bez trzeciej próby', async () => {
    const f = vi.fn(async () => odpowiedz(400, blad21184));
    vi.stubGlobal('fetch', f);
    const { c } = klient();
    const err = await c.sendInvoice('<Faktura/>').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KsefV2ApiError);
    expect((err as KsefV2ApiError).przejsciowy).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('inny błąd 400 (np. schemat): bez ponowienia, nie przejściowy', async () => {
    const f = vi.fn(async () => odpowiedz(400, { exception: { exceptionDetailList: [{ exceptionCode: 21405 }] } }));
    vi.stubGlobal('fetch', f);
    const { c } = klient();
    const err = await c.sendInvoice('<Faktura/>').catch((e: unknown) => e);
    expect((err as KsefV2ApiError).przejsciowy).toBe(false);
    expect((err as KsefV2ApiError).httpStatus).toBe(400);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
