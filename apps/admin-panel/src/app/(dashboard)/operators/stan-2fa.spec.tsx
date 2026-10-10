import { renderToStaticMarkup } from "react-dom/server";

/**
 * Fala 1B — stan 2FA zespołu na liście operatorów, tylko odczyt (bez przełącznika wymuszenia — decyzja D10):
 * TOTP i liczba passkey. Przegląd 1B-2: konto z samym passkey to nadal „BRAK TOTP” — passkey nie zamyka
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

it("TOTP, passkey ×N i BRAK TOTP (sam passkey to nie drugi składnik); podsumowanie zespołu; bez przełącznika wymuszenia", async () => {
  (adminApi as jest.Mock).mockImplementation(async (s: string) => {
    if (s === "/staff/me/access") return { role: "ADMIN", isAdmin: true, permissions: [] };
    if (s.startsWith("/admin/users")) return { rows: [op("a", true, 0), op("b", false, 2), op("c", false, 0)], total: 3, page: 1, totalPages: 1 };
    return [];
  });
  const html = renderToStaticMarkup(await Strona({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("TOTP");
  expect(html).toContain("BRAK TOTP · passkey ×2");
  expect(html).toContain("2FA (TOTP): 1 z 3 · passkey: 1");
  expect(html.match(/data-drugi-skladnik="brak"/g)).toHaveLength(2);
  expect(html).not.toMatch(/wymu[sś]/i);
});
