import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * D1 (decyzja 10.10) — panel operatora dla ADMIN i STAFF. Każda strona panelu ma w mapie STRONY uprawnienie, którego
 * wymaga API pod nią; strona z uprawnieniem woła bramkaStrony (wejście z adresu bez uprawnienia → „Brak uprawnień”,
 * nie 500 ani pusta strona), a menu i Cmd+K pokazują pozycję tylko z tym samym uprawnieniem.
 */
jest.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
jest.mock("./api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));

import { adminApi } from "./api";
import { STRONY, type SciezkaStrony } from "./uprawnienia-stron";
import { bramkaStrony } from "./bramka-strony";
import { grupy, UKRYTE } from "@/components/admin-shell";

const KATALOG = join(__dirname, "..", "app", "(dashboard)");

function strony(dir: string): string[] {
  return readdirSync(dir).flatMap((w) => {
    const p = join(dir, w);
    if (statSync(p).isDirectory()) return strony(p);
    return w === "page.tsx" ? [p] : [];
  });
}
const sciezka = (plik: string) => {
  const r = relative(KATALOG, plik).split(sep).slice(0, -1).join("/");
  return r ? `/${r}` : "/";
};
const PLIKI = strony(KATALOG).map((p) => [sciezka(p), p] as const);
/** Uprawnienie strony z mapy (lista porównywana treścią, nie referencją); „brak wpisu” — strony nie ma w mapie. */
const permStrony = (href: string) => (href in STRONY ? STRONY[href as SciezkaStrony].perm : "brak wpisu");

describe("D1 — mapa uprawnień stron", () => {
  it("każda strona panelu ma wpis w mapie i każdy wpis ma stronę", () => {
    expect(PLIKI.map(([s]) => s).sort()).toEqual(Object.keys(STRONY).sort());
  });

  it.each(PLIKI.filter(([s]) => STRONY[s as SciezkaStrony].perm !== null))("%s woła bramkaStrony na początku", (s, plik) => {
    const kod = readFileSync(plik, "utf-8");
    expect(kod).toContain(`await bramkaStrony("${s}")`);
  });

  it("menu i Cmd+K: uprawnienie pozycji = uprawnienie strony (pozycja bez uprawnień — strona dla każdego)", () => {
    const pozycje = [...grupy(null).flatMap((g) => g.pozycje.flatMap((p) => p.pod)), ...UKRYTE];
    const rozjazdy = pozycje
      .filter((p) => JSON.stringify(p.perm ?? null) !== JSON.stringify(permStrony(p.href)))
      .map((p) => `${p.href}: menu ${JSON.stringify(p.perm ?? null)}, strona ${JSON.stringify(permStrony(p.href))}`);
    expect(rozjazdy).toEqual([]);
  });

  it("konfiguracja, plany/ceny, VPN i zespół-konfiguracja — tylko administrator (D1)", () => {
    for (const s of ["/settings/platform", "/settings/company", "/settings/mail", "/vpn", "/vps", "/autoscaling", "/plans/new", "/domain-pricing", "/nodes/wizard"] as const) {
      expect({ s, perm: STRONY[s].perm }).toEqual({ s, perm: "ADMIN" });
    }
  });
});

describe("D1 — bramka strony", () => {
  const api = adminApi as jest.Mock;
  const dostep = (d: unknown) => api.mockReset().mockImplementation(async (p: string) => (p === "/staff/me/access" ? d : Promise.reject(new Error("?"))));
  const html = async (s: SciezkaStrony) => {
    const el = await bramkaStrony(s);
    return el ? renderToStaticMarkup(el) : null;
  };

  it("operator bez uprawnienia: „Brak uprawnień” z powodem, tytuł strony", async () => {
    dostep({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW"] });
    const h = await html("/nodes");
    expect(h).toContain("Brak uprawnień");
    expect(h).toContain("Wymaga NODES_VIEW");
    expect(h).toContain("Węzły");
  });

  it("operator z uprawnieniem i administrator — strona się renderuje (null)", async () => {
    dostep({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW"] });
    expect(await html("/nodes")).toBeNull();
    dostep({ role: "ADMIN", isAdmin: true, permissions: [] });
    expect(await html("/settings/platform")).toBeNull();
  });

  it("strona tylko dla administratora: operator z kompletem uprawnień — odmowa", async () => {
    dostep({ role: "STAFF", isAdmin: false, permissions: ["SETTINGS_MANAGE", "STAFF_MANAGE", "PLANS_MANAGE"] });
    expect(await html("/settings/platform")).toContain("Wymaga roli administratora");
    expect(await html("/plans/new")).toContain("Brak uprawnień");
  });

  it("karta usługi: wystarcza którekolwiek z CUSTOMERS_VIEW / SUBSCRIPTIONS_MANAGE (jak @StaffPermAny)", async () => {
    dostep({ role: "STAFF", isAdmin: false, permissions: ["CUSTOMERS_VIEW"] });
    expect(await html("/subscriptions/[id]")).toBeNull();
    dostep({ role: "STAFF", isAdmin: false, permissions: ["TICKETS_VIEW"] });
    expect(await html("/subscriptions/[id]")).toContain("Brak uprawnień");
  });

  it("weryfikacja 11.10: lista usług jak karta — L1 (CUSTOMERS_VIEW) ją otwiera, bez CUSTOMERS_VIEW i SUBSCRIPTIONS_MANAGE nie", async () => {
    dostep({ role: "STAFF", isAdmin: false, permissions: ["DASHBOARD_VIEW", "CUSTOMERS_VIEW", "TICKETS_VIEW", "TICKETS_MANAGE", "BILLING_VIEW"] });
    expect(await html("/subscriptions")).toBeNull();
    dostep({ role: "STAFF", isAdmin: false, permissions: ["SUBSCRIPTIONS_MANAGE"] });
    expect(await html("/subscriptions")).toBeNull();
    dostep({ role: "STAFF", isAdmin: false, permissions: ["TICKETS_VIEW"] });
    expect(await html("/subscriptions")).toContain("Wymaga CUSTOMERS_VIEW lub SUBSCRIPTIONS_MANAGE");
  });

  it("API uprawnień nie odpowiada — odmowa (fail-closed) z prośbą o odświeżenie", async () => {
    api.mockReset().mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await html("/customers")).toContain("Nie udało się sprawdzić uprawnień");
  });

  it("strony dla każdego operatora (Twoje konto, wnioski, baza wiedzy) nie pytają o uprawnienia", async () => {
    api.mockReset();
    for (const s of ["/settings", "/wnioski", "/knowledge-base"] as const) expect(await html(s)).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("pulpit bez DASHBOARD_VIEW: podpowiedź, żeby zacząć od menu", async () => {
    dostep({ role: "STAFF", isAdmin: false, permissions: ["TICKETS_VIEW"] });
    expect(await html("/")).toContain("Wybierz moduł z menu.");
  });
});
