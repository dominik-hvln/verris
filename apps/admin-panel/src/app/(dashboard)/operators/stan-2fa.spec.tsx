import { renderToStaticMarkup } from "react-dom/server";

/**
 * Fala 1B — stan 2FA zespołu na liście operatorów: TOTP i liczba passkey. Przegląd 1B-2: konto z samym passkey to nadal „BRAK TOTP” — passkey nie zamyka
 * logowania samym hasłem, a REQUIRE_2FA_FOR_STAFF sprawdza tylko TOTP (auth.service.ts).
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/operators" }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn(), adminApiMultipart: jest.fn() }));

import { adminApi } from "@/lib/api";
import Strona from "./page";

const op = (id: string, isTwoFactorEnabled: boolean, passkeys: number) => ({
  id,
  email: `${id}@verris.pl`,
  firstName: null,
  lastName: null,
  role: "STAFF",
  isTwoFactorEnabled,
  passkeys,
  loginBlocked: false,
  canAccessGrafana: false,
  createdAt: "2026-10-01T00:00:00Z",
});

const odpowiedzi = (dostep: unknown, wymog: unknown) =>
  (adminApi as jest.Mock).mockReset().mockImplementation(async (s: string) => {
    if (s === "/staff/me/access") return dostep;
    if (s === "/admin/platform-settings/wymog-2fa") return wymog;
    if (s.startsWith("/admin/users")) return { rows: [op("a", true, 0), op("b", false, 2), op("c", false, 0)], total: 3, page: 1, totalPages: 1 };
    return [];
  });
const ADMIN = { role: "ADMIN", isAdmin: true, permissions: [] };

it("TOTP, passkey ×N i BRAK TOTP (sam passkey to nie drugi składnik); podsumowanie zespołu", async () => {
  odpowiedzi(ADMIN, { wlaczony: false, wymuszonyEnv: false, obowiazuje: false });
  const html = renderToStaticMarkup(await Strona({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("TOTP");
  expect(html).toContain("BRAK TOTP · passkey ×2");
  expect(html).toContain("2FA (TOTP): 1 z 3 · passkey: 1");
  expect(html.match(/data-drugi-skladnik="brak"/g)).toHaveLength(2);
});

/** D10 (10.10) — przełącznik wymuszenia 2FA na stronie zespołu: tylko administrator; env wymusza → nieaktywny. */
describe("D10 — wymuś 2FA dla zespołu", () => {
  it("administrator: przełącznik ze stanem z API", async () => {
    odpowiedzi(ADMIN, { wlaczony: true, wymuszonyEnv: false, obowiazuje: true });
    const html = renderToStaticMarkup(await Strona({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-wymog-2fa="obowiazuje"');
    expect(html).toMatch(/role="switch" aria-checked="true"/);
    expect(html).not.toMatch(/role="switch"[^>]*disabled=""/);
  });

  it("REQUIRE_2FA_FOR_STAFF w konfiguracji: przełącznik nieaktywny z wyjaśnieniem", async () => {
    odpowiedzi(ADMIN, { wlaczony: false, wymuszonyEnv: true, obowiazuje: true });
    const html = renderToStaticMarkup(await Strona({ searchParams: Promise.resolve({}) }));
    expect(html).toMatch(/role="switch"[^>]*disabled=""/);
    expect(html).toContain("panel go nie wyłączy");
  });

  it("operator z STAFF_MANAGE: bez przełącznika i bez zapytania o ustawienie (API tylko dla ADMIN-a)", async () => {
    odpowiedzi({ role: "STAFF", isAdmin: false, permissions: ["STAFF_MANAGE"] }, null);
    const html = renderToStaticMarkup(await Strona({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("data-wymog-2fa");
    expect((adminApi as jest.Mock).mock.calls.map((c) => c[0])).not.toContain("/admin/platform-settings/wymog-2fa");
  });
});
