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
