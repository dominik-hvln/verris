jest.mock('next/navigation', () => ({
  redirect: jest.fn((cel: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { cel });
  }),
}));
jest.mock('@/lib/auth', () => ({ setAuthCookie: jest.fn(async () => undefined) }));
// P4-4: cel z rejestracji w ciasteczku (lib/cel-po-rejestracji.ts) — słoik w pamięci zamiast cookies() z żądania.
const sloikCiastek = new Map<string, string>();
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (sloikCiastek.has(n) ? { value: sloikCiastek.get(n)! } : undefined),
    set: (n: string, v: string) => void sloikCiastek.set(n, v),
    delete: (n: string) => void sloikCiastek.delete(n),
  }),
}));
jest.mock('@/lib/captcha', () => ({ captchaTokenFromForm: () => undefined }));
const sesjaKlienta = jest.fn(async (_t: string): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }));
jest.mock('@/lib/tylko-klient', () => ({ sesjaKlienta: (t: string) => sesjaKlienta(t) }));
jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string, public status = 0, public body?: unknown) {
      super(message);
    }
  },
}));

import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { setAuthCookie } from '@/lib/auth';
import { submitLogin, submitTwoFactor } from './actions';

/** Decyzja 15.10 (#12) — konto zespołu nie dostaje sesji w panelu klienta (hasło i 2FA). */
describe('logowanie – tylko konta klienckie', () => {
  const f = (pola: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(pola)) d.set(k, v);
    return d;
  };
  beforeEach(() => jest.clearAllMocks());

  it('konto zespołu: komunikat, bez ciasteczka sesji i bez przekierowania', async () => {
    sesjaKlienta.mockResolvedValueOnce({ ok: false, error: 'To konto zespołu Verris' });
    (apiFetch as jest.Mock).mockResolvedValueOnce({ access_token: 't-zespol' });
    const stan = await submitLogin(undefined, f({ email: 'op@verris.pl', password: 'x' }));
    expect(stan.error).toContain('konto zespołu');
    expect(sesjaKlienta).toHaveBeenCalledWith('t-zespol');
    expect(setAuthCookie).not.toHaveBeenCalled();

    sesjaKlienta.mockResolvedValueOnce({ ok: false, error: 'To konto zespołu Verris' });
    (apiFetch as jest.Mock).mockResolvedValueOnce({ access_token: 't-2fa' });
    expect((await submitTwoFactor(undefined, f({ challengeToken: 'ch', code: '123456' }))).error).toContain('konto zespołu');
    expect(setAuthCookie).not.toHaveBeenCalled();
  });
});

/** PB-45 — po zalogowaniu (hasło i 2FA) wracamy na `next` z linku w mailu, ale tylko do ścieżek panelu. */
describe('logowanie – powrót na next', () => {
  const link = '/dashboard/migrations/zgoda?serviceId=s1&id=m1&token=abc';
  const formularz = (pola: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(pola)) f.set(k, v);
    return f;
  };
  const celPrzekierowania = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return (e as { cel?: string }).cel;
    }
    return undefined;
  };

  beforeEach(() => jest.clearAllMocks());

  it('hasło: przekierowanie na next', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ access_token: 't' });
    expect(await celPrzekierowania(submitLogin(undefined, formularz({ email: 'a@b.pl', password: 'x', next: link })))).toBe(link);
  });

  it('hasło: obcy adres w next → /dashboard; bez next → /dashboard', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ access_token: 't' });
    expect(await celPrzekierowania(submitLogin(undefined, formularz({ email: 'a@b.pl', password: 'x', next: 'https://zly.example' })))).toBe('/dashboard');
    expect(await celPrzekierowania(submitLogin(undefined, formularz({ email: 'a@b.pl', password: 'x' })))).toBe('/dashboard');
  });

  it('2FA: next przechodzi przez ekran kodu i po kodzie trafia do przekierowania', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ twoFactorRequired: true, challengeToken: 'ch' });
    const stan = await submitLogin(undefined, formularz({ email: 'a@b.pl', password: 'x', next: link }));
    expect(stan).toMatchObject({ twoFactorRequired: true, next: link });
    expect(redirect).not.toHaveBeenCalled();

    (apiFetch as jest.Mock).mockResolvedValueOnce({ access_token: 't' });
    expect(await celPrzekierowania(submitTwoFactor(undefined, formularz({ challengeToken: 'ch', code: '123456', next: stan.next! })))).toBe(link);
  });
});

/** Decyzja 14.10 — miękka captcha: widget pojawia się, gdy API zażąda (CAPTCHA_WYMAGANA), i zostaje do skutku. */
describe('logowanie – captcha dopiero po progu nieudanych prób', () => {
  const f = (pola: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(pola)) d.set(k, v);
    return d;
  };
  beforeEach(() => jest.clearAllMocks());

  it('400 CAPTCHA_WYMAGANA → komunikat z API i flaga widgetu (nie „Nieprawidłowe dane logowania”)', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(
      new ApiError('Kilka nieudanych prób logowania – potwierdź, że nie jesteś robotem, i zaloguj się ponownie.', 400, { code: 'CAPTCHA_WYMAGANA' }),
    );
    const stan = await submitLogin(undefined, f({ email: 'a@b.pl', password: 'x' }));
    expect(stan).toMatchObject({ captchaWymagana: true, email: 'a@b.pl' });
    expect(stan.error).toContain('nie jesteś robotem');
  });

  it('złe hasło po pokazaniu widgetu – widget zostaje; bez wcześniejszego żądania – brak widgetu', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new ApiError('Invalid credentials', 401));
    expect(await submitLogin({ captchaWymagana: true }, f({ email: 'a@b.pl', password: 'x' }))).toMatchObject({ captchaWymagana: true });
    expect((await submitLogin(undefined, f({ email: 'a@b.pl', password: 'x' }))).captchaWymagana).toBeUndefined();
  });
});

/** P3-09 — wyłączone subkonto (API: 401 po poprawnym haśle) dostaje prawdziwy powód, nie „Nieprawidłowe dane”. */
describe('logowanie – subkonto wyłączone przez właściciela', () => {
  it('komunikat o wyłączonym dostępie; złe hasło dalej ogólne', async () => {
    const d = (pola: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(pola)) f.set(k, v);
      return f;
    };
    (apiFetch as jest.Mock).mockRejectedValueOnce(new (ApiError as unknown as new (m: string, s: number) => Error)('Subkonto zostało wyłączone przez właściciela.', 401));
    const stan = await submitLogin(undefined, d({ email: 'piotr@firma.pl', password: 'dobre-haslo' }));
    expect(stan.error).toMatch(/Właściciel konta wyłączył Twój dostęp/);
    (apiFetch as jest.Mock).mockRejectedValueOnce(new (ApiError as unknown as new (m: string, s: number) => Error)('Invalid credentials', 401));
    expect((await submitLogin(undefined, d({ email: 'piotr@firma.pl', password: 'zle' }))).error).toBe('Nieprawidłowe dane logowania');
  });
});

/** P4-4 — klient zarejestrował się z „Załóż firmową pocztę” na verris.pl i loguje się po potwierdzeniu e-maila. */
describe('logowanie – cel zapamiętany przy rejestracji', () => {
  const f = (pola: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(pola)) d.set(k, v);
    return d;
  };
  beforeEach(() => {
    jest.clearAllMocks();
    sloikCiastek.clear();
  });

  it('bez next: po zalogowaniu zamówienie poczty, ciasteczko skasowane', async () => {
    sloikCiastek.set('verris_cel', '/dashboard/services/new?type=email');
    (apiFetch as jest.Mock).mockResolvedValueOnce({ access_token: 't' });
    await expect(submitLogin(undefined, f({ email: 'a@b.pl', password: 'x' }))).rejects.toMatchObject({
      cel: '/dashboard/services/new?type=email',
    });
    expect(sloikCiastek.has('verris_cel')).toBe(false);
  });

  it('po kodzie 2FA też prowadzi do celu', async () => {
    sloikCiastek.set('verris_cel', '/dashboard/reseller');
    (apiFetch as jest.Mock).mockResolvedValueOnce({ access_token: 't' });
    await expect(submitTwoFactor(undefined, f({ challengeToken: 'c', code: '123456' }))).rejects.toMatchObject({ cel: '/dashboard/reseller' });
  });
});
