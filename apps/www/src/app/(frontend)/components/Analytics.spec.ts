import { runInNewContext } from 'node:vm';
import { consentDefault } from './Analytics';
import { applyConsent, CONSENT_COOKIE, type CookieConsent } from '@/lib/cookie-consent';

/**
 * CL-05 — Consent Mode v2 na verris.pl.
 * https://developers.google.com/tag-platform/security/guides/consent
 *
 * CO PILNUJE.
 *  - Skrypt inline (przed GTM) ustawia `default` dla KAŻDEGO typu zgody, którym steruje baner,
 *    i wszystkie poza `security_storage` są „denied”. Do 29.09.2026 `functionality_storage`
 *    było domyślnie „granted”, a `personalization_storage` bez wartości domyślnej, choć kategoria
 *    „Funkcjonalne” jest opcjonalna i domyślnie wyłączona.
 *  - `ad_user_data` i `ad_personalization` (wymagane od Consent Mode v2) są w `default` i w `update`.
 *  - Odtworzenie zgody z ciasteczka w skrypcie inline daje TO SAMO `update`, co applyConsent()
 *    po kliknięciu w banerze — dwa miejsca w kodzie, jeden stan dla Google.
 *
 * Skrypt wykonujemy naprawdę (node:vm), a nie czytamy jego źródła.
 */

type Args = ArrayLike<unknown>;
const zgoda = (a: Args) => ({ cmd: a[1], params: a[2] as Record<string, unknown> });

function uruchomInline(cookie: string): Args[] {
  const ctx: Record<string, unknown> = { document: { cookie } };
  ctx.window = ctx;
  runInNewContext(consentDefault, ctx);
  return ctx.dataLayer as Args[];
}

/** Tylko polecenia `consent` (skrypt ustawia też `set` ads_data_redaction / url_passthrough). */
const polecenia = (dl: Args[]) => dl.filter((a) => a[0] === 'consent');

function updateZApplyConsent(c: CookieConsent): Record<string, unknown> {
  const w = globalThis as unknown as { window?: { dataLayer: unknown[] } };
  w.window = { dataLayer: [] };
  try {
    applyConsent(c, false);
    const update = (w.window.dataLayer as Args[]).find((a) => a[0] === 'consent' && a[1] === 'update');
    return update![2] as Record<string, unknown>;
  } finally {
    delete w.window;
  }
}

const ciasteczko = (c: CookieConsent) => `x=1; ${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(c))}`;

describe('CL-05 Consent Mode v2 — default przed GTM (verris.pl)', () => {
  it('pierwsze polecenie to consent default; wszystko „denied” poza security_storage', () => {
    const dl = uruchomInline('');
    expect(polecenia(dl)).toHaveLength(1);
    expect(dl[0][0]).toBe('consent');
    const { cmd, params } = zgoda(dl[0]);
    expect(cmd).toBe('default');
    expect(params).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
      wait_for_update: 500,
    });
  });

  it('każdy typ ustawiany przez applyConsent() ma wartość domyślną', () => {
    const { params } = zgoda(uruchomInline('')[0]);
    const typy = Object.keys(
      updateZApplyConsent({ v: 1, ts: 't', functional: true, analytics: true, marketing: true }),
    );
    for (const t of typy) expect(params).toHaveProperty(t);
  });

  it('brak, stara wersja albo uszkodzone ciasteczko → tylko default, bez update', () => {
    for (const cookie of [
      '',
      ciasteczko({ v: 0, ts: 't', functional: true, analytics: true, marketing: true }),
      `${CONSENT_COOKIE}=%7Bzepsute`,
    ]) {
      expect(polecenia(uruchomInline(cookie)).map((a) => a[1])).toEqual(['default']);
    }
  });

  const kombinacje = [false, true].flatMap((functional) =>
    [false, true].flatMap((analytics) =>
      [false, true].map((marketing) => ({ v: 1, ts: 't', functional, analytics, marketing })),
    ),
  );

  it.each(kombinacje)(
    'zapisana zgoda %o: update z inline === update z applyConsent()',
    (c) => {
      const dl = polecenia(uruchomInline(ciasteczko(c)));
      expect(dl.map((a) => a[1])).toEqual(['default', 'update']);
      expect(zgoda(dl[1]).params).toEqual(updateZApplyConsent(c));
    },
  );

  it('zgoda marketingowa steruje ad_user_data i ad_personalization', () => {
    const tak = updateZApplyConsent({ v: 1, ts: 't', functional: false, analytics: false, marketing: true });
    const nie = updateZApplyConsent({ v: 1, ts: 't', functional: true, analytics: true, marketing: false });
    expect([tak.ad_user_data, tak.ad_personalization]).toEqual(['granted', 'granted']);
    expect([nie.ad_user_data, nie.ad_personalization]).toEqual(['denied', 'denied']);
  });
});
