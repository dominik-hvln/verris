import { NextRequest } from 'next/server';

jest.mock('@/lib/session-profile', () => ({
  fetchSessionProfileState: jest.fn(async () => ({ profile: null, unauthorized: false })),
}));

import { middleware } from './middleware';

/** API chwilowo nie odpowiada na /users/me: strona → 503 z komunikatem, akcja serwera → dalej (API ją oceni). */
describe('middleware przy niedostępnym API', () => {
  const zadanie = (naglowki: Record<string, string> = {}) =>
    new NextRequest('http://localhost:3001/dashboard/services', { headers: { cookie: 'auth_token=t', ...naglowki } });

  it('nawigacja dostaje stronę „Panel chwilowo niedostępny” (503), sesja zostaje', async () => {
    const res = await middleware(zadanie());
    expect(res.status).toBe(503);
    expect(res.cookies.get('auth_token')).toBeUndefined();
  });

  it('akcja serwera przechodzi dalej zamiast HTML-a, którego klient Next nie umie odczytać', async () => {
    const res = await middleware(zadanie({ 'next-action': 'abc' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});

/** Impersonacja z tej samej przeglądarki: po jej końcu wraca odłożona sesja właściciela. */
describe('middleware — sesja właściciela po impersonacji', () => {
  const { fetchSessionProfileState } = jest.requireMock('@/lib/session-profile') as { fetchSessionProfileState: jest.Mock };
  const zadanie = (cookie: string) => new NextRequest('http://localhost:3001/dashboard/services?x=1', { headers: { cookie } });

  it('impersonacja wygasła (brak auth_token): sesja właściciela wraca, bez logowania', async () => {
    const res = await middleware(zadanie('auth_token_wlasciciel=wl; impersonation_operator=admin'));
    expect(res.headers.get('location')).toBe('http://localhost:3001/dashboard/services?x=1');
    expect(res.cookies.get('auth_token')?.value).toBe('wl');
    expect(res.cookies.get('auth_token_wlasciciel')?.value).toBe('');
  });

  it('API odrzuca token impersonacji: też wraca właściciel', async () => {
    fetchSessionProfileState.mockResolvedValueOnce({ profile: null, unauthorized: true });
    const res = await middleware(zadanie('auth_token=imp; auth_token_wlasciciel=wl'));
    expect(res.cookies.get('auth_token')?.value).toBe('wl');
  });

  it('bez odłożonej sesji: odrzucony token → logowanie jak dotąd', async () => {
    fetchSessionProfileState.mockResolvedValueOnce({ profile: null, unauthorized: true });
    const res = await middleware(zadanie('auth_token=imp'));
    expect(res.headers.get('location')).toContain('/login?reason=session-ended');
  });
});
