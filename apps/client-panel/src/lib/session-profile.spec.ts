import { apiBaseUrl, fetchSessionProfile } from './session-profile';

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
