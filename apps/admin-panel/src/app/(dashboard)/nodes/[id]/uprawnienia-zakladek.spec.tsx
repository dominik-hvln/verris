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

it("F3.1: zakładka „Poczta” — bez MAIL_QUEUE_NODE panel kolejki się nie renderuje (nagłówki wszystkich klientów); NOC i admin — tak", async () => {
  zDostepem({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW", "NODES_MANAGE", "MAIL_QUEUE_VIEW"] });
  const bez = await render("poczta");
  expect(bez).toContain('data-zablokowane="Wymaga MAIL_QUEUE_NODE"');
  expect(bez).not.toContain('id="kolejka-poczty"');
  zDostepem({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW", "MAIL_QUEUE_NODE"] });
  expect(await render("poczta")).toContain('id="kolejka-poczty"');
  zDostepem({ role: "ADMIN", isAdmin: true, permissions: [] });
  const adm = await render("poczta");
  expect(adm).toContain("Wypchnij kolejkę");
  expect(adm).toContain("Poczta");
});

it("F3.2: zakładka „Bezpieczeństwo” — bez IP_BLOCKS_NODE panel blokad się nie renderuje, bez ACCOUNT_DIAGNOSTICS_VIEW lista malware się nie wczytuje", async () => {
  zDostepem({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW", "NODES_MANAGE"] });
  const bez = await render("bezpieczenstwo");
  expect(bez).toContain('data-zablokowane="Wymaga IP_BLOCKS_NODE"');
  expect(bez).not.toContain('id="blokady-ip-naglowek"');
  expect(bez).toContain("Wymaga ACCOUNT_DIAGNOSTICS_VIEW");
  expect(api.mock.calls.map((c) => c[0])).not.toContain("/admin/servers/malware?wezel=w1");
  zDostepem({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW", "IP_BLOCKS_NODE", "ACCOUNT_DIAGNOSTICS_VIEW"] });
  const noc = await render("bezpieczenstwo");
  expect(noc).toContain('id="blokady-ip-naglowek"');
  expect(api.mock.calls.map((c) => c[0])).toContain("/admin/servers/malware?wezel=w1");
  expect(noc).toContain("Bezpieczeństwo");
});

it("F3.4: zakładka „Usługi i logi” — bez NODE_SERVICES panel się nie renderuje (logi wszystkich klientów węzła); NOC i admin — tak", async () => {
  zDostepem({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW", "NODES_MANAGE", "IP_BLOCKS_NODE"] });
  const bez = await render("uslugi");
  expect(bez).toContain('data-zablokowane="Wymaga NODE_SERVICES"');
  expect(bez).not.toContain('id="uslugi-wezla-naglowek"');
  zDostepem({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW", "NODE_SERVICES"] });
  const noc = await render("uslugi");
  expect(noc).toContain('id="uslugi-wezla-naglowek"');
  expect(noc).toContain("Usługi i logi");
  zDostepem({ role: "ADMIN", isAdmin: true, permissions: [] });
  expect(await render("uslugi")).toContain('id="logi-wezla-naglowek"');
});
