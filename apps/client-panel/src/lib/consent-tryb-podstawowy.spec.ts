/**
 * @jest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Decyzja 22 Dominika (4.11.2026) — Consent Mode v2 w trybie PODSTAWOWYM w panelu klienta: przed zgodą nie ładuje się
 * GTM ani Meta Pixel (żadnego skryptu z Google/Meta w dokumencie), po zgodzie — najpierw `consent update`, potem
 * gtm.js (raz, z nonce strony). Na starym kodzie test pada: layout ładował gtm.js zawsze (`<Script id="verris-gtm">`),
 * a applyConsent() go nie wstrzykiwał.
 */
import { applyConsent, writeConsent } from "./cookie-consent";

const GTM = "GTM-PANEL1";

const skrypty = () => [...document.querySelectorAll("script")].map((s) => s.getAttribute("src") ?? "");
const doGoogleLubMeta = () => skrypty().filter((s) => /google|facebook|doubleclick/.test(s));

beforeEach(() => {
  // cookie-consent czyta NEXT_PUBLIC_* przy wywołaniu (w buildzie Next podstawia je w kodzie).
  process.env.NEXT_PUBLIC_GTM_ID = GTM;
  process.env.NEXT_PUBLIC_META_PIXEL_ID = "987654321";
  document.head.innerHTML = '<script nonce="N0nce"></script>';
  document.cookie = "cookies_consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.dataLayer = [];
  delete window.fbq;
  delete window._fbq;
});

it("komponent layoutu nie zawiera loadera GTM — przed zgodą nic do Google", () => {
  const zrodlo = readFileSync(join(__dirname, "../components/analytics-scripts.tsx"), "utf8");
  expect(zrodlo).not.toMatch(/googletagmanager|gtm\.js|verris-gtm/);
});

it("„Tylko niezbędne” i sama zgoda funkcjonalna: żadnego skryptu Google ani Meta", () => {
  writeConsent({ functional: false, analytics: false, marketing: false });
  writeConsent({ functional: true, analytics: false, marketing: false });
  expect(doGoogleLubMeta()).toEqual([]);
  expect(window.fbq).toBeUndefined();
});

it("zgoda analityczna: consent update przed gtm.js, gtm.js raz i z nonce, bez Pixela", () => {
  writeConsent({ functional: false, analytics: true, marketing: false });
  applyConsent({ v: 1, ts: "t", functional: false, analytics: true, marketing: false }, false);
  expect(doGoogleLubMeta()).toEqual([`https://www.googletagmanager.com/gtm.js?id=${GTM}`]);
  const gtm = document.querySelector<HTMLScriptElement>('script[src^="https://www.googletagmanager.com/gtm.js"]')!;
  expect(gtm.getAttribute("nonce")).toBe("N0nce");
  const dl = window.dataLayer as unknown[];
  const update = dl.findIndex((a) => (a as ArrayLike<unknown>)[0] === "consent" && (a as ArrayLike<unknown>)[1] === "update");
  const start = dl.findIndex((a) => (a as { event?: string }).event === "gtm.js");
  expect(update).toBeGreaterThanOrEqual(0);
  expect(start).toBeGreaterThan(update);
});

it("zgoda marketingowa: gtm.js i Meta Pixel", () => {
  writeConsent({ functional: false, analytics: false, marketing: true });
  expect(doGoogleLubMeta()).toEqual([
    `https://www.googletagmanager.com/gtm.js?id=${GTM}`,
    "https://connect.facebook.net/en_US/fbevents.js",
  ]);
});
