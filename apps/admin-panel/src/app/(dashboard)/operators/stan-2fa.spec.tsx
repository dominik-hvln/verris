import { renderToStaticMarkup } from "react-dom/server";

/**
 * Fala 1B — stan 2FA zespołu na liście operatorów, tylko odczyt (bez przełącznika wymuszenia — decyzja D10):
 * TOTP i liczba passkey; konto z samym passkey ma drugi składnik (wcześniej lista pokazywała „BRAK”).
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

it("TOTP, passkey ×N i BRAK; podsumowanie zespołu; bez przełącznika wymuszenia", async () => {
  (adminApi as jest.Mock).mockImplementation(async (s: string) => {
    if (s === "/staff/me/access") return { role: "ADMIN", isAdmin: true, permissions: [] };
    if (s.startsWith("/admin/users")) return { rows: [op("a", true, 0), op("b", false, 2), op("c", false, 0)], total: 3, page: 1, totalPages: 1 };
    return [];
  });
  const html = renderToStaticMarkup(await Strona({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("TOTP");
  expect(html).toContain("passkey ×2");
  expect(html).toContain("Drugi składnik (TOTP lub passkey): 2 z 3");
  expect(html.match(/data-drugi-skladnik="brak"/g)).toHaveLength(1);
  expect(html).not.toMatch(/wymu[sś]/i);
});
