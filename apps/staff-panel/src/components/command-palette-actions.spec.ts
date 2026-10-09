/** 10.10 — /admin/search zwraca też węzły i migracje; paleta obsługi bierze tylko typy, do których ma trasy. */
const mockStaffApi = jest.fn();
jest.mock("@/lib/staff-api", () => ({ staffApi: (...a: unknown[]) => mockStaffApi(...a) }));

import { staffGlobalSearchAction } from "./command-palette-actions";

it("odrzuca typy bez trasy w panelu obsługi (węzeł, migracja)", async () => {
  mockStaffApi.mockResolvedValue({
    results: [
      { type: "user", id: "u1", title: "a", subtitle: "", userId: "u1" },
      { type: "node", id: "n1", title: "t1", subtitle: "", userId: null },
      { type: "ticket", id: "t1", title: "x", subtitle: "", userId: "u1" },
      { type: "migration", id: "m1", title: "s.pl", subtitle: "", userId: "u1" },
    ],
    pominiete: [],
  });
  expect((await staffGlobalSearchAction("t1")).map((r) => r.type)).toEqual(["user", "ticket"]);
});

it("bez CUSTOMERS_VIEW (API pomija klientów) — bez faktur i domen, które prowadzą na kartę klienta", async () => {
  mockStaffApi.mockResolvedValue({
    results: [
      { type: "invoice", id: "f1", title: "FV/1", subtitle: "", userId: "u1" },
      { type: "domain", id: "a1", title: "sklep.pl", subtitle: "", userId: "u1" },
      { type: "service", id: "s1", title: "WEB-1", subtitle: "", userId: "u1" },
      { type: "ticket", id: "t1", title: "x", subtitle: "", userId: "u1" },
    ],
    pominiete: ["user", "node", "migration"],
  });
  expect((await staffGlobalSearchAction("sklep")).map((r) => r.type)).toEqual(["service", "ticket"]);
});
