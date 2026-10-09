import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
jest.mock("@/lib/staff-access", () => ({ fetchStaffAccess: jest.fn() }));
jest.mock("./data", () => ({ getOperatorLoginHistory: jest.fn() }));
jest.mock("../../roles/actions", () => ({ getOperators: jest.fn(), getRoles: jest.fn(), setOperatorRoles: jest.fn(), setOperatorActive: jest.fn() }));
jest.mock("../actions", () => ({ setGrafanaAccessAction: jest.fn() }));

import { fetchStaffAccess } from "@/lib/staff-access";
import { getOperators, getRoles } from "../../roles/actions";
import { getOperatorLoginHistory } from "./data";
import OperatorDetailPage from "./page";

const ADMIN = { role: "ADMIN", isAdmin: true, permissions: [] };
const historia = {
  user: { id: "op1", email: "jan@verris.pl", role: "STAFF", loginBlocked: false, loginBlockedReason: null },
  lockout: { windowMinutes: 15, threshold: 10, recentFailures: 0, currentlyLockedOut: false },
  suspiciousAlerts: [],
  rows: [],
};
const operator = { id: "op1", email: "jan@verris.pl", firstName: "Jan", lastName: null, role: "STAFF", staffRoleId: "l2", roleIds: ["l2"], loginBlocked: false, canAccessGrafana: true };
const role = [{ id: "l2", name: "L2 Specjalista techniczny", description: null, permissions: [], isSystem: true, memberCount: 1 }];
const render = async () => renderToStaticMarkup(await OperatorDetailPage({ params: Promise.resolve({ id: "op1" }) }));

/** 10.10 — role i blokada były na /roles, Grafana na liście /operators; karta pokazywała tylko logowania. */
describe("Karta operatora", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getOperatorLoginHistory as jest.Mock).mockResolvedValue(historia);
    (getOperators as jest.Mock).mockResolvedValue([operator]);
    (getRoles as jest.Mock).mockResolvedValue(role);
  });

  it("administrator: role, blokada i Grafana na karcie, obok historii logowań", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValue(ADMIN);
    const html = await render();
    expect(html).toContain("data-role-operatora");
    expect(html).toContain("L2 Specjalista techniczny");
    expect(html).toMatch(/>Wyłącz</);
    expect(html).toContain("Włączony");
    expect(html).toContain("Brak zdarzeń logowania");
  });

  it("operator bez roli administratora: działania wyszarzone z powodem", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValue({ role: "STAFF", isAdmin: false, permissions: ["STAFF_MANAGE"] });
    const html = await render();
    expect(html).not.toContain("data-role-operatora");
    expect(html).not.toMatch(/>Wyłącz</);
    expect(html.match(/title="Wymaga roli administratora"/g)).toHaveLength(3);
  });

  it("operator bez roli administratora widzi bieżące role i Grafanę (dawniej na /roles i liście /operators)", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValue({ role: "STAFF", isAdmin: false, permissions: ["STAFF_MANAGE"] });
    const html = await render();
    expect(html).toContain("L2 Specjalista techniczny");
    expect(html).toContain("Włączony");
  });

  it("historia logowań niedostępna — karta i tak pokazuje dostęp", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValue(ADMIN);
    (getOperatorLoginHistory as jest.Mock).mockRejectedValue(new Error("Brak uprawnień."));
    const html = await render();
    expect(html).toContain("data-role-operatora");
    expect(html).toContain("Historia logowań niedostępna: Brak uprawnień.");
  });

  it("administrator na karcie — bez przełączników, pełny dostęp", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValue(ADMIN);
    (getOperators as jest.Mock).mockResolvedValue([{ ...operator, role: "ADMIN" }]);
    const html = await render();
    expect(html).toContain("Administrator ma pełny dostęp");
    expect(html).not.toContain("data-role-operatora");
  });
});
