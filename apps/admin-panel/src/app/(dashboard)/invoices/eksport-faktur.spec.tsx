import { renderToStaticMarkup } from "react-dom/server";

/**
 * Decyzja 10.10: L1 (BILLING_VIEW) przegląda faktury i portfel — widzi, czy usługa jest opłacona — ale eksport list
 * do CSV (faktury, transakcje portfela) ma tylko EXPORT_DATA, jak API.
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/invoices" }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn(), adminApiMultipart: jest.fn() }));

import { adminApi } from "@/lib/api";
import Faktury from "./page";
import Portfel from "../billing/page";

const api = adminApi as jest.Mock;
function odpowiedzi(permissions: string[]) {
  api.mockReset().mockImplementation(async (s: string) => {
    if (s === "/staff/me/access") return { role: "STAFF", isAdmin: false, permissions };
    if (s === "/admin/me" || s.startsWith("/auth")) return null;
    if (s.startsWith("/admin/invoices")) return { rows: [], total: 7, limit: 50, offset: 0 };
    if (s === "/admin/dashboard/overview") return { billing: { periodDays: 30, walletNetPln: "100.00", walletByTypePln: {} } };
    return null;
  });
}

it("L1 (BILLING_VIEW) widzi faktury i portfel, ale bez eksportu CSV", async () => {
  odpowiedzi(["DASHBOARD_VIEW", "CUSTOMERS_VIEW", "TICKETS_VIEW", "TICKETS_MANAGE", "BILLING_VIEW"]);
  const faktury = renderToStaticMarkup(await Faktury({ searchParams: Promise.resolve({}) }));
  expect(faktury).toContain("Faktury");
  expect(faktury).not.toContain('data-eksport="faktury"');
  const portfel = renderToStaticMarkup(await Portfel());
  expect(portfel).toContain("Rozliczenia (portfel)");
  expect(portfel).not.toContain('data-eksport="portfel"');
});

it("z EXPORT_DATA (L4) eksport faktur i transakcji jest dostępny", async () => {
  odpowiedzi(["BILLING_VIEW", "EXPORT_DATA"]);
  expect(renderToStaticMarkup(await Faktury({ searchParams: Promise.resolve({}) }))).toContain('data-eksport="faktury"');
  expect(renderToStaticMarkup(await Portfel())).toContain('data-eksport="portfel"');
});
