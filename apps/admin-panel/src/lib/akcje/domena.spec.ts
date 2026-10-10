import { AKCJE_DOMENY } from "./domena";
import { dzialaniaObiektu } from "./rejestr";
import { akcjeObiektuDlaZapytania } from "./szukaj";

/**
 * F2.7 (D8) — działania domeny jak w API: odczyt od L1 (CUSTOMERS_VIEW), operacje DOMAINS_MANAGE (L3), odnowienie
 * na koszt Verris dodatkowo BILLING_MANAGE (L4); domena poza Verris — bez operacji u rejestratora.
 */
const L1 = { isAdmin: false, permissions: ["CUSTOMERS_VIEW", "TICKETS_VIEW"] };
const L3 = { isAdmin: false, permissions: ["CUSTOMERS_VIEW", "DOMAINS_MANAGE"] };
const L4 = { isAdmin: false, permissions: ["CUSTOMERS_VIEW", "DOMAINS_MANAGE", "BILLING_MANAGE"] };
const zablokowane = (dostep: typeof L1) =>
  Object.fromEntries(dzialaniaObiektu(AKCJE_DOMENY, { id: "d1", uNas: true, transferLock: true, klientId: "u1" }, dostep).map((d) => [d.id, d.zablokowane]));

it("L1: operacje wyszarzone z nazwą uprawnienia; dane abonenta i karta klienta dostępne", () => {
  const z = zablokowane(L1);
  for (const id of ["synchronizuj", "odnow", "blokada", "kod-epp", "ns"]) expect(z[id]).toBe("Wymaga DOMAINS_MANAGE");
  expect(z["odnow-verris"]).toBe("Wymaga DOMAINS_MANAGE i BILLING_MANAGE");
  expect(z.abonent).toBeNull();
  expect(z.klient).toBeNull();
});

it("L3: wszystko poza odnowieniem na koszt Verris; L4 i administrator — wszystko", () => {
  const z3 = zablokowane(L3);
  expect(Object.entries(z3).filter(([, v]) => v).map(([k]) => k)).toEqual(["odnow-verris"]);
  expect(z3["odnow-verris"]).toBe("Wymaga BILLING_MANAGE");
  expect(Object.values(zablokowane(L4)).filter(Boolean)).toEqual([]);
  expect(Object.values(zablokowane({ isAdmin: true, permissions: [] })).filter(Boolean)).toEqual([]);
});

it("blokada transferu: nazwa wg stanu; domena poza Verris — tylko karta klienta", () => {
  const nazwa = (transferLock?: boolean) => dzialaniaObiektu(AKCJE_DOMENY, { id: "d1", uNas: true, transferLock }, L3).find((d) => d.id === "blokada")!.nazwa;
  expect(nazwa(true)).toBe("Zdejmij blokadę transferu");
  expect(nazwa(false)).toBe("Włącz blokadę transferu");
  expect(dzialaniaObiektu(AKCJE_DOMENY, { id: "d1", uNas: false, klientId: "u1" }, L4).map((d) => d.id)).toEqual(["klient"]);
});

it("Cmd+K: wynik „domena” z wyszukiwarki ma działania; POZA — bez operacji u rejestratora", () => {
  const u = akcjeObiektuDlaZapytania({ type: "domena", id: "d1", status: "U_NAS", userId: "u1" }, "epp", L3);
  expect(u.map((a) => [a.id, a.href, a.zablokowane])).toEqual([["kod-epp", "/domains/d1#akcja-kod-epp", null]]);
  expect(akcjeObiektuDlaZapytania({ type: "domena", id: "d1", status: "POZA", userId: "u1" }, "", L3).map((a) => a.id)).toEqual(["klient"]);
});
