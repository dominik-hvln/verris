import { panelAuthCookieOptions } from './auth-cookie';

/** Ciasteczko sesji panelu obsługi: httpOnly, 8 h, secure na produkcji, domena z konfiguracji. */
describe('X-05 ciasteczko sesji obsługi', () => {
  const env = process.env as Record<string, string | undefined>;
  const ORYG = { ...env };
  afterEach(() => {
    for (const k of ['NODE_ENV', 'AUTH_COOKIE_DOMAIN']) env[k] = ORYG[k];
  });

  it('produkcja: httpOnly, secure, lax, 8 godzin', () => {
    env.NODE_ENV = 'production';
    expect(panelAuthCookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600 });
  });

  it('domena z AUTH_COOKIE_DOMAIN; pusta wartość nie ustawia domeny', () => {
    env.AUTH_COOKIE_DOMAIN = '.verris.pl';
    expect(panelAuthCookieOptions().domain).toBe('.verris.pl');
    env.AUTH_COOKIE_DOMAIN = '  ';
    expect(panelAuthCookieOptions()).not.toHaveProperty('domain');
  });
});
