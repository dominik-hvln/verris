jest.mock('next/navigation', () => ({
  redirect: jest.fn((cel: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { cel });
  }),
}));
jest.mock('@/lib/auth', () => ({ setAuthCookie: jest.fn(async () => undefined) }));
jest.mock('@/lib/captcha', () => ({ captchaTokenFromForm: () => undefined }));
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
import { submitLogin, submitTwoFactor } from './actions';

/** PB-45 — po zalogowaniu (hasło i 2FA) wracamy na `next` z linku w mailu, ale tylko do ścieżek panelu. */
describe('logowanie — powrót na next', () => {
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
describe('logowanie — captcha dopiero po progu nieudanych prób', () => {
  const f = (pola: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(pola)) d.set(k, v);
    return d;
  };
  beforeEach(() => jest.clearAllMocks());

  it('400 CAPTCHA_WYMAGANA → komunikat z API i flaga widgetu (nie „Nieprawidłowe dane logowania”)', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(
      new ApiError('Kilka nieudanych prób logowania — potwierdź, że nie jesteś robotem, i zaloguj się ponownie.', 400, { code: 'CAPTCHA_WYMAGANA' }),
    );
    const stan = await submitLogin(undefined, f({ email: 'a@b.pl', password: 'x' }));
    expect(stan).toMatchObject({ captchaWymagana: true, email: 'a@b.pl' });
    expect(stan.error).toContain('nie jesteś robotem');
  });

  it('złe hasło po pokazaniu widgetu — widget zostaje; bez wcześniejszego żądania — brak widgetu', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new ApiError('Invalid credentials', 401));
    expect(await submitLogin({ captchaWymagana: true }, f({ email: 'a@b.pl', password: 'x' }))).toMatchObject({ captchaWymagana: true });
    expect((await submitLogin(undefined, f({ email: 'a@b.pl', password: 'x' }))).captchaWymagana).toBeUndefined();
  });
});
