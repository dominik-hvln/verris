import { renderToStaticMarkup } from "react-dom/server";

/** F3.9 — strona główna wybiera pulpit wg roli: NOC — flota, konsultant — zgłoszenia, finanse — płatności, admin — stan platformy. */
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
jest.mock("@/components/pomoc", () => ({ Pomoc: () => null }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/" }));
jest.mock("@/components/admin-dashboard-real", () => ({ AdminDashboardReal: () => <div data-pulpit="admin" /> }));
jest.mock("@/lib/admin-overview-data", () => ({ fetchAdminDashboardOverview: async () => ({}) }));
const dostep = jest.fn();
jest.mock("@/lib/staff-access", () => ({ fetchStaffAccess: () => dostep() }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));

import { adminApi } from "@/lib/api";
import Strona from "./page";

const api = adminApi as jest.Mock;
const render = async (pulpit?: string) => renderToStaticMarkup(await Strona({ searchParams: Promise.resolve({ pulpit }) }));

const NOC = {
  flota: { aktywne: 2, serwis: 0, offline: 0, bezSygnalu: 1, przyjmujaKonta: 2, uwaga: [] },
  alerty: { uslugi: [{ serverId: "w1", wezel: "fra-01", usluga: "exim" }], incydenty: [] },
  kolejki: { zakladane: 0, zadaniaWToku: 1, zadaniaBledyDoba: 0, bledy: [] },
  kopie: { kontaBezSwiezejKopii: 3 },
  przekroczenia: { kontDoba: 0, najgorsze: [] },
};
const OBSLUGA = {
  moje: { otwarte: 1, poTerminie: 1, zagrozone: 0, czekaNaKlienta: 0, lista: [{ id: "t1aaaaaa-x", temat: "Nie działa poczta", status: "OPEN", priorytet: "HIGH", klient: "Firma", termin: "2026-10-11T08:00:00Z", rodzajTerminu: "odpowiedz", stan: "po-terminie" }] },
  kolejka: { nieprzypisane: 0, poTerminie: 0, pilne: 0, lista: [] },
};

beforeEach(() => api.mockReset());

it("NOC: pulpit floty z alertem usługi (link do zakładki Usługi i logi), zakładki: flota i stan platformy", async () => {
  dostep.mockResolvedValue({ role: "STAFF", isAdmin: false, permissions: ["DASHBOARD_VIEW", "NODES_VIEW", "NODES_MANAGE", "NODE_SERVICES", "TICKETS_VIEW"] });
  api.mockImplementation(async (s: string) => (s === "/admin/pulpit/noc" ? NOC : Promise.reject(new Error(s))));
  const html = await render();
  expect(html).toContain('data-pulpit="noc"');
  expect(html).toContain('href="/nodes/w1?sekcja=uslugi"');
  expect(html).toContain("Poczta SMTP (Exim)");
  expect(html).toContain(">Stan platformy<");
  expect(api.mock.calls.map((c) => c[0])).toEqual(["/admin/pulpit/noc"]);
});

it("konsultant: moje zgłoszenia z terminem SLA; zakładka Finanse się nie pokazuje", async () => {
  dostep.mockResolvedValue({ role: "STAFF", isAdmin: false, permissions: ["DASHBOARD_VIEW", "CUSTOMERS_VIEW", "TICKETS_VIEW", "TICKETS_MANAGE", "BILLING_VIEW"] });
  api.mockImplementation(async (s: string) => (s === "/admin/pulpit/obsluga" ? OBSLUGA : Promise.reject(new Error(s))));
  const html = await render("finanse");
  expect(html).toContain('data-pulpit="obsluga"');
  expect(html).toContain("po terminie");
  expect(html).not.toContain(">Finanse<");
});

it("administrator: stan platformy; ?pulpit=noc — pulpit floty; awaria API — komunikat zamiast pustych liczb", async () => {
  dostep.mockResolvedValue({ role: "ADMIN", isAdmin: true, permissions: [] });
  expect(await render()).toContain('data-pulpit="admin"');
  api.mockRejectedValue(new Error("ECONNREFUSED"));
  const html = await render("noc");
  expect(html).not.toContain('data-pulpit="noc"');
  expect(html).toContain("Nie udało się wczytać");
});
