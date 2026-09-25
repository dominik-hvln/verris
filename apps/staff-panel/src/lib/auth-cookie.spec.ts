import { panelAuthCookieOptions, staraDomenaCiasteczka } from './auth-cookie';

/** Ciasteczko sesji panelu obsługi: httpOnly, 8 h, secure na produkcji, tylko host panelu. */
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

  it('ciasteczko tylko dla hosta panelu — AUTH_COOKIE_DOMAIN nie rozszerza go na subdomeny', () => {
    env.AUTH_COOKIE_DOMAIN = '.verris.pl';
    expect(panelAuthCookieOptions()).not.toHaveProperty('domain');
    expect(staraDomenaCiasteczka()).toBe('.verris.pl');
  });
});
