import { renderToStaticMarkup } from "react-dom/server";

/** F2.4 — lista klientów: stan, saldo, data i wyszukiwanie w API; CSV tylko z EXPORT_DATA. */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/customers" }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn(), adminApiMultipart: jest.fn() }));

import { adminApi } from "@/lib/api";
import Strona from "./page";

const api = adminApi as jest.Mock;
function odpowiedzi(dostep: unknown) {
  api.mockReset().mockImplementation(async (s: string) => {
    if (s === "/staff/me/access") return dostep;
    if (s === "/admin/me" || s.startsWith("/auth")) return null;
    if (s.startsWith("/admin/users")) return { rows: [], total: 120, page: 2, totalPages: 3, limit: 50, offset: 50 };
    return null;
  });
}
const render = async (sp: Record<string, string>) => renderToStaticMarkup(await Strona({ searchParams: Promise.resolve(sp) }));

it("filtry idą do API; strony i zakładki stanu zachowują pozostałe filtry; nieznany stan pomijany", async () => {
  odpowiedzi({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW"] });
  const html = await render({ status: "zalegle", saldoOd: "10", od: "2026-01-01", search: "firma", page: "2" });
  expect(api).toHaveBeenCalledWith("/admin/users?search=firma&status=zalegle&saldoOd=10&od=2026-01-01&page=2&limit=50");
  expect(html).toContain('href="/customers?search=firma&amp;status=zalegle&amp;saldoOd=10&amp;od=2026-01-01&amp;page=3"');
  expect(html).toContain('href="/customers?search=firma&amp;saldoOd=10&amp;od=2026-01-01"'); // „Wszystkie”
  expect(html).not.toContain('data-eksport="klienci"');
  await render({ status: "cokolwiek" });
  expect(api).toHaveBeenCalledWith("/admin/users?limit=50");
});

it("eksport CSV z EXPORT_DATA — link do /api/klienci-csv z filtrami (bez strony)", async () => {
  odpowiedzi({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW", "EXPORT_DATA"] });
  const html = await render({ status: "zablokowane", saldoDo: "0", page: "3" });
  expect(html).toContain('href="/api/klienci-csv?status=zablokowane&amp;saldoDo=0"');
});
