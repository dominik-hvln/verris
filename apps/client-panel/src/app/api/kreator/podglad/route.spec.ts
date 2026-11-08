import { NextRequest } from 'next/server';
import { PRZYKLAD_SALON } from '@verris/kreator';

/**
 * Paczka 120 – podgląd na żywo w edytorze kreatora (POST formularza do ramki). Sesja z ciasteczka, wersja kreatora
 * z API (nie z formularza), walidacja modelu, CSP sandbox bez allow-same-origin, CSS/JS inline.
 */
const mockApi = jest.fn();
jest.mock('@/lib/api', () => {
  const prawdziwy = jest.requireActual('@/lib/api') as typeof import('@/lib/api');
  return { ApiError: prawdziwy.ApiError, apiFetch: (...a: unknown[]) => mockApi(...a) };
});

import { ApiError } from '@/lib/api';
import { POST, GET } from './route';

const stan = (wersja: 'proba' | 'hosting' | 'pro', dostep = true) => ({ dostep, powod: dostep ? null : 'Verris Kreator jest jeszcze w testach.', wersja: dostep ? wersja : null });

let nrTokenu = 0;
function zadanie(pola: Record<string, string>, opcje: { cookie?: boolean; naglowki?: Record<string, string>; cialo?: string } = {}) {
  nrTokenu += 1;
  return new NextRequest('https://panel.verris.pl/api/kreator/podglad', {
    method: 'POST',
    body: opcje.cialo ?? new URLSearchParams(pola).toString(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'sec-fetch-site': 'same-origin',
      ...(opcje.cookie === false ? {} : { cookie: `auth_token=token-${nrTokenu}` }),
      ...opcje.naglowki,
    },
  });
}

const salon = () => structuredClone(PRZYKLAD_SALON) as unknown as { strony: { sekcje: { id: string; typ: string; wariant: string; dane: { naglowek: string } }[] }[] };

describe('POST /api/kreator/podglad', () => {
  beforeEach(() => {
    mockApi.mockReset();
    process.env.NEXT_PUBLIC_API_URL = 'https://api.verris.pl';
  });

  it('bez ciasteczka sesji → 401, bez pytania API', async () => {
    const r = await POST(zadanie({ model: JSON.stringify(PRZYKLAD_SALON) }, { cookie: false }));
    expect(r.status).toBe(401);
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('sesja odrzucona przez API (401 z /kreator/stan) → 401', async () => {
    mockApi.mockRejectedValue(new ApiError('Unauthorized', 401, null));
    const r = await POST(zadanie({ model: JSON.stringify(PRZYKLAD_SALON) }));
    expect(r.status).toBe(401);
  });

  it('zły model → 400 z listą pól (nieczytelny JSON i model niezgodny ze schematem)', async () => {
    mockApi.mockResolvedValue(stan('hosting'));
    expect((await POST(zadanie({ model: '{nie-json' }))).status).toBe(400);
    const m = salon();
    m.strony[0]!.sekcje[0]!.dane.naglowek = '';
    const r = await POST(zadanie({ model: JSON.stringify(m) }));
    expect(r.status).toBe(400);
    expect(await r.text()).toContain('strony.0.sekcje.0.dane.naglowek');
  });

  it('nagłówki: CSP sandbox allow-scripts BEZ allow-same-origin, default-src none, fonty z API, ramka tylko z panelu, noindex, no-store', async () => {
    mockApi.mockResolvedValue(stan('hosting'));
    const r = await POST(zadanie({ model: JSON.stringify(PRZYKLAD_SALON), podstrona: '' }));
    expect(r.status).toBe(200);
    const csp = r.headers.get('content-security-policy')!;
    expect(csp).toContain('sandbox allow-scripts');
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'unsafe-inline'");
    expect(csp).toMatch(/font-src data: https:\/\/api\.verris\.pl(;|$)/);
    expect(csp).toContain('img-src data: https:');
    expect(csp).toContain("frame-ancestors 'self'");
    expect(r.headers.get('x-robots-tag')).toContain('noindex');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('HTML zawiera nagłówek z modelu, CSS inline (bez zewnętrznego arkusza) i skrypt edytora', async () => {
    mockApi.mockResolvedValue(stan('hosting'));
    const m = salon();
    m.strony[0]!.sekcje[0]!.dane.naglowek = 'Fryzury, które pasują do Ciebie';
    delete (m.strony[0]!.sekcje[0]!.dane as { wyroznienie?: string }).wyroznienie;
    const r = await POST(zadanie({ model: JSON.stringify(m), zaznaczona: m.strony[0]!.sekcje[0]!.id, przewin: '420' }));
    const html = await r.text();
    expect(html).toContain('Fryzury, które pasują do Ciebie');
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(html).toContain("zrodlo=Z");
    expect(html).toContain('"y":420');
    expect(html).toContain(`"z":"${m.strony[0]!.sekcje[0]!.id}"`);
    expect(mockApi).toHaveBeenCalledWith('/kreator/stan', expect.anything());
  });

  it('wersja kreatora z API, nie z formularza: pole wersja=pro nie odblokowuje układów Pro w wersji hosting', async () => {
    const m = salon();
    const hero = m.strony[0]!.sekcje.find((s) => s.typ === 'hero')!;
    hero.wariant = 'hero-mozaika'; // wariant Pro, zastępczy: hero-podzielony
    mockApi.mockResolvedValue(stan('hosting'));
    const bezPro = await (await POST(zadanie({ model: JSON.stringify(m), wersja: 'pro', pro: '0' }))).text();
    expect(bezPro).not.toContain('hero-mozaika');
    expect(bezPro).toContain('hero-podzielony');
    mockApi.mockResolvedValue(stan('pro'));
    const zPro = await (await POST(zadanie({ model: JSON.stringify(m), pro: '0' }))).text();
    expect(zPro).toContain('hero-mozaika');
    // Podgląd funkcji Pro wolno zawsze – to tylko podgląd (ze wstęgą „Pro”).
    mockApi.mockResolvedValue(stan('hosting'));
    const podgladPro = await (await POST(zadanie({ model: JSON.stringify(m), pro: '1' }))).text();
    expect(podgladPro).toContain('hero-mozaika');
    expect(podgladPro).toContain('wstega-pro');
  });

  it('edycja=1: teksty z data-k, mostek w trybie edycji, skrypt edytora bez obsługi kliknięć; CSP bez zmian', async () => {
    mockApi.mockResolvedValue(stan('hosting'));
    const zwykly = await POST(zadanie({ model: JSON.stringify(PRZYKLAD_SALON), podstrona: '' }));
    const r = await POST(zadanie({ model: JSON.stringify(PRZYKLAD_SALON), podstrona: '', edycja: '1' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-security-policy')).toBe(zwykly.headers.get('content-security-policy'));
    const html = await r.text();
    expect(html).toContain('data-k="strony.0.sekcje.0.dane.naglowek"');
    expect(html).toContain('data-k-sekcja="');
    expect(html).toContain('"tryb":"edycja"');
    expect(html).toContain('<script data-k-most>');
    expect(html).toContain('"e":1');
    const bezEdycji = await zwykly.text();
    expect(bezEdycji).not.toMatch(/\sdata-k(-[a-z]+)?="/);
    expect(bezEdycji).not.toContain('data-k-most');
    expect(bezEdycji).toContain('"e":0');
  });

  it('edycja=zaznacz (telefon): mostek w trybie zaznaczania; inna wartość = zwykły podgląd', async () => {
    mockApi.mockResolvedValue(stan('hosting'));
    const tel = await (await POST(zadanie({ model: JSON.stringify(PRZYKLAD_SALON), edycja: 'zaznacz' }))).text();
    expect(tel).toContain('"tryb":"zaznacz"');
    expect(tel).toContain('data-k="');
    const zle = await (await POST(zadanie({ model: JSON.stringify(PRZYKLAD_SALON), edycja: 'tak' }))).text();
    expect(zle).not.toContain('data-k-most');
    expect(zle).not.toContain('data-k="');
  });

  it('zdjęcia z biblioteki: adresy z API tylko dla zasobów z modelu, CSP dopuszcza obrazy z API; błąd API = ramka zastępcza', async () => {
    const ZASOB = '0b6f6c1e-9a4b-4c1d-8e2f-3a4b5c6d7e8f';
    const m = salon() as unknown as { strony: { sekcje: { dane: Record<string, unknown> }[] }[] };
    m.strony[0]!.sekcje[0]!.dane.obraz = { alt: 'Wnętrze salonu', zrodlo: 'wlasne', zasobId: ZASOB, proporcje: '4:3', szerokosc: 2400, wysokosc: 1800 };
    mockApi.mockImplementation(async (sciezka: string) =>
      sciezka.startsWith('/kreator/zasoby/adresy') ? { adresy: { [ZASOB]: 'https://api.verris.pl/kreator/z/token-abc/' } } : stan('hosting'),
    );
    const r = await POST(zadanie({ model: JSON.stringify(m), edycja: '1' }));
    expect(mockApi).toHaveBeenCalledWith(`/kreator/zasoby/adresy?ids=${ZASOB}`, expect.anything());
    const html = await r.text();
    expect(html).toContain('https://api.verris.pl/kreator/z/token-abc/960.webp 960w');
    expect(html).toContain('data-k-obraz="strony.0.sekcje.0.dane.obraz"');
    expect(r.headers.get('content-security-policy')).toMatch(/img-src data: https: https:\/\/api\.verris\.pl(;|$)/);

    mockApi.mockImplementation(async (sciezka: string) => {
      if (sciezka.startsWith('/kreator/zasoby/adresy')) throw new ApiError('Błąd', 500, null);
      return stan('hosting');
    });
    const bezAdresow = await POST(zadanie({ model: JSON.stringify(m) }));
    expect(bezAdresow.status).toBe(200);
    const h2 = await bezAdresow.text();
    expect(h2).not.toContain('/kreator/z/');
    expect(h2).toContain('class="ph ');
  });

  it('brak dostępu do kreatora → 403 z powodem z API', async () => {
    mockApi.mockResolvedValue(stan('hosting', false));
    const r = await POST(zadanie({ model: JSON.stringify(PRZYKLAD_SALON) }));
    expect(r.status).toBe(403);
    expect(await r.text()).toContain('w testach');
  });

  it('cudzy formularz (sec-fetch-site cross-site) → 403; zły typ treści → 415; za duże ciało → 413', async () => {
    mockApi.mockResolvedValue(stan('hosting'));
    expect((await POST(zadanie({ model: '{}' }, { naglowki: { 'sec-fetch-site': 'cross-site' } }))).status).toBe(403);
    expect((await POST(zadanie({}, { naglowki: { 'content-type': 'application/json' }, cialo: '{}' }))).status).toBe(415);
    expect((await POST(zadanie({}, { cialo: `model=${'a'.repeat(600 * 1024)}` }))).status).toBe(413);
  });

  it('nieznana podstrona → 404; GET → 405 z komunikatem', async () => {
    mockApi.mockResolvedValue(stan('hosting'));
    expect((await POST(zadanie({ model: JSON.stringify(PRZYKLAD_SALON), podstrona: 'nie-ma' }))).status).toBe(404);
    expect((await GET()).status).toBe(405);
  });
});

// zlozPodglad: libs/kreator/src/render/podglad-jeden-plik.spec.ts (paczka 123 – jedno składanie dla API i panelu).
