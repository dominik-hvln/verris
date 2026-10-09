import { runInNewContext } from "node:vm";
import { consentDefault, gtmLoader } from "./analytics-scripts";
import { applyConsent, CONSENT_COOKIE, type CookieConsent } from "@/lib/cookie-consent";

/**
 * CL-05 — Consent Mode v2 w panelu.
 * https://developers.google.com/tag-platform/security/guides/consent
 *
 * CO PILNUJE.
 *  - Skrypt inline (przed GTM) ustawia `default` dla każdego typu zgody, którym steruje baner;
 *    wszystko „denied” poza `security_storage`, łącznie z `ad_user_data` i `ad_personalization`.
 *  - Odtworzenie zgody z ciasteczka daje TO SAMO `update`, co applyConsent() po kliknięciu
 *    w banerze. Te dwa miejsca są osobnym kodem (skrypt inline musi działać przed bundlem),
 *    więc rozjazd między nimi jest realnym ryzykiem — na verris.pl właśnie się rozjechały.
 *
 * Skrypt wykonujemy naprawdę (node:vm), a nie czytamy jego źródła.
 */

type Args = ArrayLike<unknown>;

function uruchomInline(cookie: string): Args[] {
  const ctx: Record<string, unknown> = { document: { cookie } };
  ctx.window = ctx;
  runInNewContext(consentDefault, ctx);
  return (ctx.dataLayer as Args[]).filter((a) => a[0] === "consent");
}

function updateZApplyConsent(c: CookieConsent): Record<string, unknown> {
  const w = globalThis as unknown as { window?: { dataLayer: unknown[] } };
  w.window = { dataLayer: [] };
  try {
    applyConsent(c, false);
    const update = (w.window.dataLayer as Args[]).find((a) => a[0] === "consent" && a[1] === "update");
    return update![2] as Record<string, unknown>;
  } finally {
    delete w.window;
  }
}

const ciasteczko = (c: CookieConsent) => `x=1; ${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(c))}`;

describe("CL-05 Consent Mode v2 — default przed GTM (panel)", () => {
  it("default: wszystko „denied” poza security_storage", () => {
    const dl = uruchomInline("");
    expect(dl.map((a) => a[1])).toEqual(["default"]);
    expect(dl[0][2]).toEqual({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      functionality_storage: "denied",
      personalization_storage: "denied",
      security_storage: "granted",
      wait_for_update: 500,
    });
  });

  it("każdy typ ustawiany przez applyConsent() ma wartość domyślną", () => {
    const def = uruchomInline("")[0][2];
    const typy = Object.keys(
      updateZApplyConsent({ v: 1, ts: "t", functional: true, analytics: true, marketing: true }),
    );
    for (const t of typy) expect(def).toHaveProperty(t);
  });

  it("brak, stara wersja albo uszkodzone ciasteczko → tylko default", () => {
    for (const cookie of [
      "",
      ciasteczko({ v: 0, ts: "t", functional: true, analytics: true, marketing: true }),
      `${CONSENT_COOKIE}=%7Bzepsute`,
    ]) {
      expect(uruchomInline(cookie).map((a) => a[1])).toEqual(["default"]);
    }
  });

  const kombinacje = [false, true].flatMap((functional) =>
    [false, true].flatMap((analytics) =>
      [false, true].map((marketing) => ({ v: 1, ts: "t", functional, analytics, marketing })),
    ),
  );

  it.each(kombinacje)("zapisana zgoda %o: update z inline === update z applyConsent()", (c) => {
    const dl = uruchomInline(ciasteczko(c));
    expect(dl.map((a) => a[1])).toEqual(["default", "update"]);
    expect(dl[1][2]).toEqual(updateZApplyConsent(c));
  });
});

/** CSP z nonce (09.10): snippet GTM przekazuje nonce do gtm.js, żeby GTM nadał go tagom z własnym HTML. */
describe("GTM — nonce dla gtm.js", () => {
  it("gtm.js dostaje nonce strony i ładuje się z googletagmanager.com", () => {
    const wstawione: Array<Record<string, unknown>> = [];
    const nowy = () => {
      const el: Record<string, unknown> = {};
      el.setAttribute = (k: string, v: string) => (el[k] = v);
      return el;
    };
    const pierwszy = { parentNode: { insertBefore: (el: Record<string, unknown>) => wstawione.push(el) } };
    const ctx: Record<string, unknown> = {
      document: {
        getElementsByTagName: () => [pierwszy],
        createElement: nowy,
        // Przeglądarka ukrywa wartość atrybutu nonce (getAttribute → ""), zostaje własność .nonce.
        querySelector: (sel: string) => (sel === "[nonce]" ? { nonce: "N0nce", getAttribute: () => "" } : null),
      },
    };
    ctx.window = ctx;
    runInNewContext(gtmLoader("GTM-TEST"), ctx);
    expect(wstawione).toHaveLength(1);
    expect(wstawione[0].src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-TEST");
    expect(wstawione[0].nonce).toBe("N0nce");
  });
});
