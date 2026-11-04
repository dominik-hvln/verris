import { CERTYFIKAT_VERRIS } from './drzewa-model.js';
import { ADRESY_POSADZIMY, PosadzimyBlad, PosadzimyClient } from './posadzimy.client.js';

/**
 * Klient API partnera na atrapie fetch — bez prawdziwego API (brak tokenu w sesji). Pilnuje kształtu żądań wg
 * dokumentacji (X-AUTH-TOKEN, ścieżki, pola body) i podziału wyników: przyjęte / odrzucone (można ponowić) /
 * niepewne (nie ponawiamy sami — API nie ma klucza idempotencji).
 */
function atrapa(odpowiedz: () => Promise<Response>) {
  const wywolania: Array<{ url: string; init: RequestInit }> = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    wywolania.push({ url, init });
    return odpowiedz();
  });
  const klient = new PosadzimyClient({ baseUrl: ADRESY_POSADZIMY.test, token: 'tok-test', fetch });
  return { klient, wywolania };
}

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const zamowienie = { ...CERTYFIKAT_VERRIS, treeGroupID: 'grp-1', numberOfTrees: 2 };

describe('PosadzimyClient', () => {
  it('make_order: POST z X-AUTH-TOKEN i polami z dokumentacji; 201 z orderId i certyfikatem = przyjęte', async () => {
    const { klient, wywolania } = atrapa(() =>
      json(201, {
        status: 'success',
        data: { orderId: 77, certificateUrl: 'https://rc.panel.posadzimy.pl/c/77.pdf', certificateImageUrl: 'https://x/77.png' },
      }),
    );
    const w = await klient.zamow(zamowienie);
    expect(w).toEqual({
      rodzaj: 'przyjete',
      orderId: 77,
      certificateUrl: 'https://rc.panel.posadzimy.pl/c/77.pdf',
      certificateImageUrl: 'https://x/77.png',
    });
    expect(wywolania[0].url).toBe('https://rc.api.posadzimy.pl/api/integration/make_order');
    expect(wywolania[0].init.method).toBe('POST');
    expect((wywolania[0].init.headers as Record<string, string>)['X-AUTH-TOKEN']).toBe('tok-test');
    expect(JSON.parse(wywolania[0].init.body as string)).toEqual(zamowienie);
  });

  it('201 bez adresu certyfikatu: przyjęte z certificateUrl = null (jeszcze nie „posadzone”)', async () => {
    const { klient } = atrapa(() => json(201, { data: { orderId: 5, certificateUrl: '' } }));
    expect(await klient.zamow(zamowienie)).toMatchObject({ rodzaj: 'przyjete', orderId: 5, certificateUrl: null });
  });

  it('401/422 = odrzucone z komunikatem API (bezpiecznie ponowić po poprawce)', async () => {
    for (const status of [401, 422, 429]) {
      const { klient } = atrapa(() => json(status, { status: 'error', message: 'Invalid treeGroupID' }));
      expect(await klient.zamow(zamowienie)).toEqual({ rodzaj: 'odrzucone', blad: `HTTP ${status}: Invalid treeGroupID` });
    }
  });

  it('5xx, 408, 2xx bez orderId, przekroczony czas i zerwane połączenie = niepewne', async () => {
    const przypadki: Array<() => Promise<Response>> = [
      () => json(500, {}),
      () => json(502, { message: 'Bad gateway' }),
      () => json(408, {}),
      () => json(201, { data: {} }),
      () => Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })),
      () => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })),
    ];
    for (const p of przypadki) {
      const { klient } = atrapa(p);
      expect((await klient.zamow(zamowienie)).rodzaj).toBe('niepewne');
    }
  });

  it('brak połączenia przed wysłaniem (DNS, odmowa) = odrzucone', async () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) {
      const { klient } = atrapa(() => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code } })));
      expect(await klient.zamow(zamowienie)).toMatchObject({ rodzaj: 'odrzucone' });
    }
  });

  it('check_credit_balance: saldo; błąd API = wyjątek, nie zero', async () => {
    const ok = atrapa(() => json(200, { status: 'success', data: { creditsBalance: 1000 } }));
    expect(await ok.klient.saldo()).toBe(1000);
    expect(ok.wywolania[0].url).toBe('https://rc.api.posadzimy.pl/api/integration/check_credit_balance');
    expect(JSON.parse(ok.wywolania[0].init.body as string)).toEqual({});
    await expect(atrapa(() => json(401, { message: 'Invalid token' })).klient.saldo()).rejects.toBeInstanceOf(PosadzimyBlad);
    await expect(atrapa(() => json(200, { data: {} })).klient.saldo()).rejects.toThrow(/creditsBalance/);
  });

  it('adresy: produkcja i test (RC) jak w dokumentacji', () => {
    expect(ADRESY_POSADZIMY).toEqual({ produkcja: 'https://api.posadzimy.pl', test: 'https://rc.api.posadzimy.pl' });
  });
});
