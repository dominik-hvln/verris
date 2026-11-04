import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Decyzja 22 Dominika (4.11.2026) — Google Consent Mode v2 w trybie PODSTAWOWYM na verris.pl:
 * przed zgodą nie ładuje się GTM/gtag ani Meta Pixel i nie wychodzi żadne żądanie do Google/Meta; po zgodzie
 * najpierw `consent update`, potem gtm.js (raz). https://developers.google.com/tag-platform/security/guides/consent
 *
 * Na starym kodzie (tryb zaawansowany) test pada: Analytics renderował loader gtm.js bez względu na zgodę, layout
 * miał `<noscript>` z ramką googletagmanager.com/ns.html, a applyConsent() niczego nie ładował.
 */
jest.mock('next/navigation', () => ({ usePathname: () => '/' }));
// next/script w teście jako zwykły <script> z treścią — widać, co trafia do HTML strony.
jest.mock('next/script', () => ({
  __esModule: true,
  default: ({ id, children }: { id: string; children: string }) => <script id={id} dangerouslySetInnerHTML={{ __html: children }} />,
}));

const GTM = 'GTM-TEST123';
const PIXEL = '123456789';
// ANALYTICS.gtmId czyta env przy imporcie modułu — w teście podstawiamy identyfikator kontenera wprost.
jest.mock('@/lib/analytics', () => ({
  ...jest.requireActual('@/lib/analytics'),
  ANALYTICS: { gtmId: 'GTM-TEST123', ga4Id: '', adsId: '', metaPixelId: '123456789' },
}));

import { Analytics } from '@/app/(frontend)/components/Analytics';
import * as mod from './cookie-consent';

type Wezel = { tagName: string; src?: string; async?: boolean; attrs: Record<string, string>; setAttribute(k: string, v: string): void };

/** Minimalny DOM (www testuje w środowisku node): rejestruje każdy wstawiony skrypt. */
function atrapaPrzegladarki(cookie = '') {
  const wstawione: Wezel[] = [];
  const document = {
    cookie,
    head: { appendChild: (w: Wezel) => wstawione.push(w) },
    createElement: (tagName: string): Wezel => {
      const w: Wezel = { tagName, attrs: {}, setAttribute: (k, v) => void (w.attrs[k] = v) };
      return w;
    },
    querySelector: (sel: string) => {
      if (sel === '[nonce]') return { nonce: 'N0nce', getAttribute: () => '' };
      const m = /^script\[src\^="([^"]+)"\]$/.exec(sel);
      return m ? (wstawione.find((w) => w.src?.startsWith(m[1])) ?? null) : null;
    },
  };
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = document;
  g.window = g;
  g.location = { hostname: 'verris.pl', protocol: 'https:', search: '' };
  g.CustomEvent = class { constructor(public type: string, public init?: unknown) {} };
  g.dispatchEvent = () => true;
  g.dataLayer = [];
  delete g.fbq;
  delete g._fbq;
  return { wstawione, dataLayer: () => g.dataLayer as unknown[] };
}

function sprzataj() {
  const g = globalThis as unknown as Record<string, unknown>;
  for (const k of ['document', 'window', 'location', 'CustomEvent', 'dispatchEvent', 'dataLayer', 'fbq', '_fbq']) delete g[k];
}

const doGoogleLubMeta = (w: Wezel[]) => w.filter((x) => /google|facebook|doubleclick/.test(x.src ?? ''));

beforeEach(() => {
  // cookie-consent czyta NEXT_PUBLIC_* przy wywołaniu (w buildzie Next podstawia je w kodzie).
  process.env.NEXT_PUBLIC_GTM_ID = GTM;
  process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL;
});
afterEach(() => {
  sprzataj();
  delete process.env.NEXT_PUBLIC_GTM_ID;
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
});

describe('decyzja 22 — przed zgodą nic do Google ani Meta', () => {
  it('HTML strony: tylko Consent Mode default (bez żądań), bez loadera gtm.js i bez <noscript> z GTM', () => {
    const html = renderToStaticMarkup(<Analytics nonce="n" />);
    expect(html).toContain('id="consent-default"');
    expect(html).toContain("gtag('consent','default'");
    expect(html).not.toMatch(/googletagmanager|gtm\.js|connect\.facebook|fbevents/);
    expect(html).not.toContain('url_passthrough');
    const layout = readFileSync(join(__dirname, '../app/(frontend)/layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/googletagmanager\.com\/ns\.html|<noscript>/);
  });

  it('wejście bez decyzji i „Tylko niezbędne”: żadnego skryptu Google ani Meta, fbq nie istnieje', () => {
    const { wstawione } = atrapaPrzegladarki();
    expect(mod.readConsent()).toBeNull();
    mod.writeConsent({ functional: false, analytics: false, marketing: false });
    expect(doGoogleLubMeta(wstawione)).toEqual([]);
    expect((globalThis as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it('sama zgoda „Funkcjonalne” nie ładuje tagów Google', () => {
    const { wstawione } = atrapaPrzegladarki();
    mod.writeConsent({ functional: true, analytics: false, marketing: false });
    expect(doGoogleLubMeta(wstawione)).toEqual([]);
  });
});

describe('decyzja 22 — po zgodzie: consent update, potem tagi', () => {
  it('zgoda analityczna: gtm.js z nonce strony, raz; consent update w dataLayer przed zdarzeniem gtm.js; bez Pixela', () => {
    const { wstawione, dataLayer } = atrapaPrzegladarki();
    mod.writeConsent({ functional: false, analytics: true, marketing: false });
    mod.applyConsent({ v: 1, ts: 't', functional: false, analytics: true, marketing: false }, false);
    const gtm = wstawione.filter((w) => w.src?.startsWith('https://www.googletagmanager.com/gtm.js'));
    expect(gtm).toHaveLength(1);
    expect(gtm[0].src).toBe(`https://www.googletagmanager.com/gtm.js?id=${GTM}`);
    expect(gtm[0].attrs.nonce).toBe('N0nce');
    expect(wstawione.some((w) => /facebook/.test(w.src ?? ''))).toBe(false);

    const dl = dataLayer();
    const update = dl.findIndex((a) => (a as ArrayLike<unknown>)[0] === 'consent' && (a as ArrayLike<unknown>)[1] === 'update');
    const start = dl.findIndex((a) => (a as { event?: string }).event === 'gtm.js');
    expect(update).toBeGreaterThanOrEqual(0);
    expect(start).toBeGreaterThan(update);
    expect((dl[update] as ArrayLike<Record<string, string>>)[2]).toMatchObject({ analytics_storage: 'granted', ad_storage: 'denied' });
  });

  it('zgoda marketingowa: gtm.js i Meta Pixel (fbevents.js)', () => {
    const { wstawione } = atrapaPrzegladarki();
    mod.writeConsent({ functional: false, analytics: false, marketing: true });
    expect(wstawione.map((w) => w.src)).toEqual([
      `https://www.googletagmanager.com/gtm.js?id=${GTM}`,
      'https://connect.facebook.net/en_US/fbevents.js',
    ]);
  });

  it('powracający gość z zapisaną zgodą: tagi ładuje applyConsent przy wejściu (baner), bez zgody — nic', () => {
    const zZgoda = atrapaPrzegladarki();
    mod.applyConsent({ v: 1, ts: 't', functional: false, analytics: true, marketing: false }, false);
    expect(doGoogleLubMeta(zZgoda.wstawione)).toHaveLength(1);

    sprzataj();
    const bezZgody = atrapaPrzegladarki();
    mod.applyConsent({ v: 1, ts: 't', functional: true, analytics: false, marketing: false }, false);
    expect(doGoogleLubMeta(bezZgody.wstawione)).toEqual([]);
  });

  it('wolnoLadowacTagiGoogle: tylko zgoda analityczna albo marketingowa', () => {
    expect(mod.wolnoLadowacTagiGoogle(null)).toBe(false);
    expect(mod.wolnoLadowacTagiGoogle({ analytics: false, marketing: false })).toBe(false);
    expect(mod.wolnoLadowacTagiGoogle({ analytics: true, marketing: false })).toBe(true);
    expect(mod.wolnoLadowacTagiGoogle({ analytics: false, marketing: true })).toBe(true);
  });
});
