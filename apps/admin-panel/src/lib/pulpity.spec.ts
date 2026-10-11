import { dostepnePulpity, pulpitOperatora } from "./pulpity";

/** F3.9 — wybór pulpitu wg uprawnień (zestawy jak w rolach systemowych API, role-systemowe.ts — tu tylko istotne klucze). */
const L1 = ["DASHBOARD_VIEW", "CUSTOMERS_VIEW", "TICKETS_VIEW", "TICKETS_MANAGE", "BILLING_VIEW"];
const ROLE: Record<string, string[]> = {
  "L1 Konsultant": L1,
  "L4 Kierownik zmiany": [...L1, "NODES_VIEW", "NODES_MANAGE", "BILLING_MANAGE", "REQUESTS_APPROVE"],
  "Inżynier infrastruktury (NOC/DevOps)": ["DASHBOARD_VIEW", "NODES_VIEW", "NODES_MANAGE", "NODE_SERVICES", "TICKETS_VIEW"],
  "Finanse i księgowość": ["DASHBOARD_VIEW", "CUSTOMERS_VIEW", "BILLING_VIEW", "BILLING_MANAGE", "TICKETS_VIEW", "TICKETS_MANAGE"],
  "Audytor (tylko podgląd)": ["DASHBOARD_VIEW", "CUSTOMERS_VIEW", "TICKETS_VIEW", "BILLING_VIEW", "NODES_VIEW", "AUDIT_VIEW"],
  Marketing: ["DASHBOARD_VIEW", "PROMO_MANAGE", "KB_MANAGE"],
};
const st = (permissions: readonly string[]) => ({ isAdmin: false, permissions: [...permissions] });

it.each([
  ["L1 Konsultant", "obsluga", ["obsluga", "admin"]],
  ["L4 Kierownik zmiany", "obsluga", ["obsluga", "noc", "finanse", "admin"]],
  ["Inżynier infrastruktury (NOC/DevOps)", "noc", ["noc", "admin"]],
  ["Finanse i księgowość", "finanse", ["obsluga", "finanse", "admin"]],
  ["Audytor (tylko podgląd)", "admin", ["admin"]],
  ["Marketing", "admin", ["admin"]],
])("%s → domyślnie %s, zakładki %j", (rola, domyslny, zakladki) => {
  const d = st(ROLE[rola]!);
  expect(pulpitOperatora(d)).toBe(domyslny);
  expect(dostepnePulpity(d)).toEqual(zakladki);
});

it("administrator: „Stan platformy” i wszystkie zakładki; wybór z adresu tylko spośród dostępnych", () => {
  expect(pulpitOperatora({ isAdmin: true, permissions: [] })).toBe("admin");
  expect(pulpitOperatora({ isAdmin: true, permissions: [] }, "noc")).toBe("noc");
  expect(pulpitOperatora(st(ROLE["L1 Konsultant"]!), "finanse")).toBe("obsluga");
  expect(pulpitOperatora(st([]))).toBeNull();
});
