import { renderToStaticMarkup } from "react-dom/server";

const redirect = jest.fn();
jest.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
jest.mock("./two-factor-section", () => ({ TwoFactorSection: () => <section data-sekcja="2fa" /> }));
jest.mock("./security/passkey-section", () => ({ PasskeySection: ({ enrollHint }: { enrollHint: boolean }) => <section data-sekcja="passkey" data-enroll={String(enrollHint)} /> }));
jest.mock("./security/break-glass-section", () => ({ BreakGlassSection: () => <section data-sekcja="break-glass" /> }));

import TwojeKontoPage from "./page";
import SecuritySettingsPage from "./security/page";

/** 10.10 — 2FA było na /settings, passkey i break-glass na /settings/security, a /settings dublowało spis ustawień. */
describe("Twoje konto", () => {
  it("2FA, passkey i break-glass na jednej stronie, bez spisu innych ustawień", async () => {
    const html = renderToStaticMarkup(await TwojeKontoPage({ searchParams: Promise.resolve({}) }));
    for (const s of ["2fa", "passkey", "break-glass"]) expect(html).toContain(`data-sekcja="${s}"`);
    expect(html).not.toContain('href="/settings/');
    expect(html).toContain('data-enroll="false"');
  });

  it("?enroll=1 po logowaniu bez passkeya", async () => {
    const html = renderToStaticMarkup(await TwojeKontoPage({ searchParams: Promise.resolve({ enroll: "1" }) }));
    expect(html).toContain('data-enroll="true"');
  });

  it("stary adres /settings/security przekierowuje (linki w e-mailach), z zachowaniem ?enroll=1", async () => {
    await SecuritySettingsPage({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenLastCalledWith("/settings");
    await SecuritySettingsPage({ searchParams: Promise.resolve({ enroll: "1" }) });
    expect(redirect).toHaveBeenLastCalledWith("/settings?enroll=1");
  });
});
