import { CONSENT_COOKIE, consentCookieDomain, readConsent } from './cookie-consent';

/**
 * X-05 — odczyt zgody cookies (art. 399–402 PKE).
 *
 * CO PILNUJE.
 *  - Zgoda w starej wersji, uszkodzona albo nie-JSON → `null`, czyli baner
 *    pokaże się znowu. Nigdy „zgoda domyślna": błąd parsowania nie może
 *    włączyć tagów marketingowych.
 *  - Pola kategorii są koercowane do boolean, a brak pola to brak zgody.
 *  - Domena ciasteczka: `.verris.pl` z `panel.verris.pl`, żeby zgoda z www
 *    obowiązywała w panelu; host-only dla localhost i adresów IP.
 *
 * Środowisko testów to `node`, więc `document`/`location` podstawiamy ręcznie.
 */

const g = globalThis as unknown as { document?: { cookie: string }; location?: { hostname: string } };

afterEach(() => {
  delete g.document;
  delete g.location;
});

const setCookie = (value: unknown) => {
  g.document = { cookie: `other=1; ${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(value))}; x=2` };
};

describe('X-05 readConsent', () => {
  it('poza przeglądarką i bez ciasteczka → null', () => {
    expect(readConsent()).toBeNull();
    g.document = { cookie: 'other=1' };
    expect(readConsent()).toBeNull();
  });

  it('poprawna zgoda v1 → odczytana', () => {
    setCookie({ v: 1, ts: '2026-09-01T00:00:00Z', functional: true, analytics: true, marketing: false });
    expect(readConsent()).toEqual({ v: 1, ts: '2026-09-01T00:00:00Z', functional: true, analytics: true, marketing: false });
  });

  it('inna wersja albo uszkodzony JSON → null (baner wraca)', () => {
    setCookie({ v: 0, ts: 'x', functional: true, analytics: true, marketing: true });
    expect(readConsent()).toBeNull();
    g.document = { cookie: `${CONSENT_COOKIE}=%7Bzepsute` };
    expect(readConsent()).toBeNull();
  });

  it('pola koercowane do boolean, brak pola = brak zgody', () => {
    setCookie({ v: 1, ts: 1, analytics: 0, marketing: '' });
    expect(readConsent()).toEqual({ v: 1, ts: '1', functional: false, analytics: false, marketing: false });
  });
});

describe('X-05 consentCookieDomain', () => {
  it.each([
    ['panel.verris.pl', '.verris.pl'],
    ['verris.pl', '.verris.pl'],
    ['localhost', ''],
    ['127.0.0.1', ''],
  ])('%s → „%s"', (hostname, expected) => {
    g.location = { hostname };
    expect(consentCookieDomain()).toBe(expected);
  });

  it('poza przeglądarką → host-only', () => {
    expect(consentCookieDomain()).toBe('');
  });
});
