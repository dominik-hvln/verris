import { renderToStaticMarkup } from "react-dom/server";

/**
 * Fala 1B — przyciski w zakładkach karty węzła (Aktualizacje, Konfiguracja, Wycofanie, Audyt) wyszarzone bez
 * uprawnienia, tak jak w sekcji „Działania” (ten sam rejestr lib/akcje/wezel.ts). Wcześniej API odmawiało
 * dopiero po kliknięciu (403).
 */
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  usePathname: () => "/nodes/w1",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn(), adminApiMultipart: jest.fn() };
});

import { adminApi } from "@/lib/api";
import Strona from "./page";

const api = adminApi as jest.Mock;
const SERWER = {
  id: "w1",
  name: "t1",
  ipAddress: "10.0.0.1",
  hostname: "t1.example",
  status: "ACTIVE",
  region: "fsn",
  daHost: "t1.example",
  daPort: 2222,
  daUsername: "admin",
  daUseTls: true,
  daAllowInvalidCert: false,
  daPasswordSet: true,
  acceptsNewAccounts: true,
  maxAccounts: null,
  reservedHeadroomPercent: 10,
  overcommitCpu: 1,
  overcommitRam: 1,
  overcommitDisk: 1,
  maintenanceReason: null,
  maintenanceStartedAt: null,
  lastHeartbeatAt: new Date().toISOString(),
  dbEngine: "mariadb",
  dbVersion: "11.4",
  targetDbVersion: "11.4",
  dbUpgradeRequestedAt: null,
  _count: { accounts: 3 },
};

function zDostepem(dostep: unknown) {
  api.mockReset();
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka === "/admin/servers/w1") return SERWER;
    if (sciezka === "/staff/me/access") return dostep;
    throw new Error("ECONNREFUSED");
  });
}

const render = async (sekcja: string) =>
  renderToStaticMarkup(await Strona({ params: Promise.resolve({ id: "w1" }), searchParams: Promise.resolve({ sekcja }) }));

/** Fragment karty od kotwicy do następnej kotwicy `id="…"` z listy. */
const blok = (html: string, id: string) => html.slice(html.indexOf(`id="${id}"`), html.indexOf(`id="${id}"`) + 400);

it("operator z NODES_MANAGE: serwis i pojemność dostępne, DirectAdmin, NS, region, WAF i status — „Wymaga roli administratora”", async () => {
  zDostepem({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW", "NODES_MANAGE"] });
  const html = await render("konfiguracja");
  for (const id of ["directadmin", "nameservers", "region", "waf", "status"]) {
    expect(blok(html, id)).toContain('data-zablokowane="Wymaga roli administratora"');
  }
  for (const id of ["serwis", "pojemnosc"]) expect(blok(html, id)).not.toContain("data-zablokowane");
  expect(html).toContain("<fieldset disabled");
});

it("operator z samym NODES_VIEW: Onboard LIVE i stos — „Wymaga NODES_MANAGE”, wycofanie też", async () => {
  zDostepem({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW"] });
  const akt = await render("aktualizacje");
  expect(akt).toContain('data-zablokowane="Wymaga NODES_MANAGE"');
  expect(akt).toContain('data-zablokowane="Wymaga roli administratora"');
  const wyc = await render("wycofanie");
  expect(wyc).toContain('data-zablokowane="Wymaga NODES_MANAGE"');
});

it("administrator: nic nie jest wyszarzone", async () => {
  zDostepem({ role: "ADMIN", isAdmin: true, permissions: [] });
  for (const s of ["aktualizacje", "konfiguracja", "wycofanie", "audyt"]) expect(await render(s)).not.toContain("data-zablokowane");
});
