import { readFileSync } from 'fs';
import { join } from 'path';
import { apiBaseUrl, fetchSessionProfile, fetchSessionProfileState } from './session-profile';

/**
 * X-05 — profil sesji, na którym middleware opiera uprawnienia subkonta.
 *
 * CO PILNUJE. `fetchSessionProfile` jest wejściem do `canAccessDashboardRoute`.
 *  - Każda awaria (4xx/5xx, sieć, zły JSON) → `null`, co middleware traktuje
 *    jako koniec sesji. Nigdy „pusty profil właściciela" — to dałoby subkontu
 *    pełny dostęp.
 *  - `isSubaccount` z API jest koercowane do boolean, a uprawnienia do listy
 *    stringów albo `null`; śmieci z API nie mogą rozszerzyć dostępu.
 *  - Adres bazowy: `API_URL` (sieć Dockera) wygrywa z publicznym (X-37).
 */

const ENV = ['API_URL', 'NEXT_PUBLIC_API_URL'] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const realFetch = global.fetch;

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  global.fetch = realFetch;
});

function mockFetch(impl: () => Promise<Partial<Response>>) {
  const fn = jest.fn(impl);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('X-05 apiBaseUrl', () => {
  it('API_URL ma pierwszeństwo przed publicznym adresem, bez końcowego ukośnika', () => {
    process.env.API_URL = ' http://api:3000/ ';
    process.env.NEXT_PUBLIC_API_URL = 'https://api.verris.pl';
    expect(apiBaseUrl()).toBe('http://api:3000');
  });

  it('pusty API_URL → adres publiczny, a bez obu → localhost', () => {
    process.env.API_URL = '  ';
    process.env.NEXT_PUBLIC_API_URL = 'https://api.verris.pl/';
    expect(apiBaseUrl()).toBe('https://api.verris.pl');
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(apiBaseUrl()).toBe('http://localhost:3000');
  });
});

describe('X-05 fetchSessionProfile', () => {
  it('wysyła token jako Bearer na /users/me', async () => {
    process.env.API_URL = 'http://api:3000';
    const fn = mockFetch(async () => ({ ok: true, json: async () => ({}) }));
    await fetchSessionProfile('tok-1');
    expect(fn).toHaveBeenCalledWith(
      'http://api:3000/users/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok-1' } }),
    );
  });

  it('odpowiedź nie-OK, błąd sieci albo zły JSON → null (sesja zakończona)', async () => {
    mockFetch(async () => ({ ok: false, status: 401 }));
    await expect(fetchSessionProfile('t')).resolves.toBeNull();
    mockFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(fetchSessionProfile('t')).resolves.toBeNull();
    mockFetch(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    }));
    await expect(fetchSessionProfile('t')).resolves.toBeNull();
  });

  it('normalizuje subkonto i uprawnienia', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ isSubaccount: 1, customerPermissions: ['BILLING_READ', 7], email: 'a@b.pl' }),
    }));
    await expect(fetchSessionProfile('t')).resolves.toEqual({
      isSubaccount: true,
      customerPermissions: ['BILLING_READ', '7'],
      email: 'a@b.pl',
      subaccountLabel: null,
      serviceScope: [],
      billingOutside: false,
    });
  });

  it('uprawnienia w złym kształcie → null (brak uprawnień), nie pełny dostęp', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ isSubaccount: true, customerPermissions: 'BILLING_MANAGE' }),
    }));
    const p = await fetchSessionProfile('t');
    expect(p?.isSubaccount).toBe(true);
    expect(p?.customerPermissions).toBeNull();
  });
});

describe('sprawdzenie sesji w middleware idzie z IP klienta', () => {
  it('x-forwarded-for trafia do API (inaczej wszyscy klienci dzielą limit kontenera panelu)', async () => {
    const fn = mockFetch(async () => ({ ok: true, json: async () => ({}) }));
    await fetchSessionProfileState('t', '203.0.113.7');
    const init = (fn.mock.calls[0] as unknown as [string, { headers: Record<string, string>; signal?: AbortSignal }])[1];
    expect(init.headers['x-forwarded-for']).toBe('203.0.113.7');
    expect(init.signal).toBeDefined();
  });

  it('middleware przekazuje nagłówek z żądania', () => {
    const src = readFileSync(join(__dirname, '..', 'middleware.ts'), 'utf8');
    expect(src).toMatch(/fetchSessionProfileState\(token, request\.headers\.get\("x-forwarded-for"\)\)/);
  });
});

describe('fetchSessionProfileState — wylogowanie tylko przy odrzuconej sesji', () => {
  // Wcześniej middleware kasował ciasteczko przy każdej awarii /users/me, więc 502 w trakcie
  // wdrożenia wylogowywało wszystkich klientów przeglądających panel.
  it.each([401, 403])('%i → sesja odrzucona', async (status) => {
    mockFetch(async () => ({ ok: false, status }));
    await expect(fetchSessionProfileState('t')).resolves.toEqual({ profile: null, unauthorized: true });
  });

  it.each([500, 502, 503])('%i → nie wiemy: bez profilu, ale bez wylogowania', async (status) => {
    mockFetch(async () => ({ ok: false, status }));
    await expect(fetchSessionProfileState('t')).resolves.toEqual({ profile: null, unauthorized: false });
  });

  it('błąd sieci → bez wylogowania', async () => {
    mockFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(fetchSessionProfileState('t')).resolves.toEqual({ profile: null, unauthorized: false });
  });

  it('200 → profil', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ isSubaccount: false, customerPermissions: null }) }));
    const r = await fetchSessionProfileState('t');
    expect(r.unauthorized).toBe(false);
    expect(r.profile?.isSubaccount).toBe(false);
  });
});
