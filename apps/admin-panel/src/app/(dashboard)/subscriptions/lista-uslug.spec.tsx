import { renderToStaticMarkup } from "react-dom/server";

/** F2.4 — lista usług: filtry i stronicowanie w API (bez cichego limitu 200), CSV tylko z EXPORT_DATA. */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => "/subscriptions" }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn(), adminApiMultipart: jest.fn() }));

import { adminApi } from "@/lib/api";
import Strona from "./page";

const api = adminApi as jest.Mock;
const wiersz = (id: string) => ({
  id, status: "PAST_DUE", serviceTag: `H-${id}`, interval: "MONTH", priceAmount: "45.00", currency: "PLN", createdAt: "2026-10-01T00:00:00Z",
  plan: { slug: "hosting", name: "Hosting" }, user: { email: `${id}@firma.pl`, firstName: null, lastName: null },
  account: { id: `a${id}`, daUsername: `u${id}`, domain: `${id}.pl`, status: "ACTIVE", serverId: "w1" },
});
function odpowiedzi(dostep: unknown) {
  api.mockReset().mockImplementation(async (s: string) => {
    if (s === "/staff/me/access") return dostep;
    if (s.startsWith("/admin/subscriptions")) return { rows: [wiersz("a"), wiersz("b")], total: 260, page: 2, limit: 50, totalPages: 6, liczby: { ACTIVE: 250, PAST_DUE: 10 } };
    if (s === "/admin/servers") return [{ id: "w1", name: "t1" }];
    if (s === "/admin/plans") throw new Error("403");
    return [];
  });
}
const render = async (sp: Record<string, string>) => renderToStaticMarkup(await Strona({ searchParams: Promise.resolve(sp) }));

it("filtry z adresu idą do API, liczba usług z total, zakładki z licznikami, strony z filtrami", async () => {
  odpowiedzi({ role: "STAFF", isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE", "NODES_VIEW"] });
  const html = await render({ stan: "PAST_DUE", wezel: "w1", q: "sklep", strona: "2" });
  expect(api).toHaveBeenCalledWith("/admin/subscriptions?status=PAST_DUE&serverId=w1&search=sklep&page=2");
  expect(html).toContain("260");
  expect(html).toContain("Wszystkie · 260");
  expect(html).toContain('href="/subscriptions?stan=PAST_DUE&amp;wezel=w1&amp;q=sklep&amp;strona=3"');
  expect(html).toContain('href="/subscriptions?wezel=w1&amp;q=sklep"'); // „Wszystkie” zdejmuje tylko stan
  expect(html).not.toContain("200 najnowszych");
  // Bez PLANS_MANAGE (403) filtr planu znika, węzeł zostaje.
  expect(html).toContain("Każdy węzeł");
  expect(html).not.toContain("Każdy plan");
  expect(html).not.toContain('data-eksport="uslugi"');
});

it("eksport CSV tylko z EXPORT_DATA — link z tymi samymi filtrami", async () => {
  odpowiedzi({ role: "STAFF", isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE", "EXPORT_DATA"] });
  const html = await render({ stan: "PAST_DUE", q: "sklep" });
  expect(html).toContain('href="/api/uslugi-csv?status=PAST_DUE&amp;search=sklep"');
});

/** K1 — rozmiar strony z adresu (?na_stronie=): przy 15 usługach i 5 na stronie nawigacja „1 / 3”. */
function piecnascie() {
  api.mockReset().mockImplementation(async (s: string) => {
    if (s === "/staff/me/access") return { role: "STAFF", isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE", "EXPORT_DATA"] };
    if (s.startsWith("/admin/subscriptions")) {
      const q = new URLSearchParams(s.split("?")[1] ?? "");
      const limit = Number(q.get("limit") ?? 50);
      const page = Number(q.get("page") ?? 1);
      return { rows: [wiersz("a")], total: 15, page, limit, totalPages: Math.max(1, Math.ceil(15 / limit)), liczby: { ACTIVE: 15 } };
    }
    return [];
  });
}

it("?na_stronie=5 idzie do API jako limit=5; strona 1 z 3; rozmiar zostaje w stronach, zakładkach i formularzu, nie w CSV", async () => {
  piecnascie();
  const html = await render({ na_stronie: "5", q: "sklep" });
  expect(api).toHaveBeenCalledWith("/admin/subscriptions?search=sklep&limit=5");
  expect(html).toMatch(/>1(<!-- -->)? \/ (<!-- -->)?3</);
  expect(html).toContain('href="/subscriptions?q=sklep&amp;strona=2&amp;na_stronie=5"');
  expect(html).toContain('href="/subscriptions?stan=ACTIVE&amp;q=sklep&amp;na_stronie=5"');
  expect(html).toContain('<input type="hidden" name="na_stronie" value="5"/>');
  expect(html).toContain('href="/api/uslugi-csv?search=sklep"');
});

it("na_stronie przycięte do 5–200; nieczytelne = domyślne 50, które nie trafia do adresu", async () => {
  piecnascie();
  await render({ na_stronie: "1" });
  expect(api).toHaveBeenCalledWith("/admin/subscriptions?limit=5");
  await render({ na_stronie: "5000" });
  expect(api).toHaveBeenCalledWith("/admin/subscriptions?limit=200");
  api.mockClear();
  const html = await render({ na_stronie: "abc" });
  expect(api).toHaveBeenCalledWith("/admin/subscriptions");
  expect(html).not.toContain("na_stronie");
});
