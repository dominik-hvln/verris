import { renderToStaticMarkup } from "react-dom/server";

/**
 * Fala 1B — Baza wiedzy: odczyt dla każdego pracownika (GET admin/kb bez uprawnienia), zapis tylko z KB_MANAGE
 * (fala 1A, kb.admin.controller.ts). Bez KB_MANAGE strona jest podglądem: przyciski zmian wyszarzone z dymkiem.
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
jest.mock("@/lib/staff-access", () => ({ fetchStaffAccess: jest.fn() }));
jest.mock("./actions", () => ({}));

import { fetchStaffAccess } from "@/lib/staff-access";
import Strona from "./page";

const html = async () => renderToStaticMarkup(await Strona());

it("bez KB_MANAGE: podgląd z powodem, „Kategoria” i „Nowy artykuł” wyszarzone", async () => {
  (fetchStaffAccess as jest.Mock).mockResolvedValue({ role: "STAFF", isAdmin: false, permissions: ["TICKETS_VIEW"] });
  const h = await html();
  expect(h).toContain("Tylko podgląd. Wymaga KB_MANAGE.");
  expect(h).toMatch(/<button[^>]*disabled=""[^>]*title="Wymaga KB_MANAGE"[^>]*>.*?Kategoria/);
  expect(h).toMatch(/<button[^>]*disabled=""[^>]*title="Wymaga KB_MANAGE"[^>]*>.*?Nowy artykuł/);
});

it("z KB_MANAGE (i admin): bez podglądu, „Kategoria” aktywna", async () => {
  (fetchStaffAccess as jest.Mock).mockResolvedValue({ role: "STAFF", isAdmin: false, permissions: ["KB_MANAGE"] });
  const h = await html();
  expect(h).not.toContain("Tylko podgląd");
  expect(h).not.toContain('title="Wymaga KB_MANAGE"');
  (fetchStaffAccess as jest.Mock).mockResolvedValue({ role: "ADMIN", isAdmin: true, permissions: [] });
  expect(await html()).not.toContain("Tylko podgląd");
});
