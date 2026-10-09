import { renderToStaticMarkup } from "react-dom/server";

/** PB-47 — przy pracowniku wiele ról naraz (z opisami); role systemowe oznaczone i nieedytowalne (klon). */
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { adminApi } from "@/lib/api";
import { RolesClient } from "./roles-client";
import { WyborRolOperatora, przelaczRole, roleOperatora } from "./wybor-rol-operatora";
import { cloneRole, setOperatorRoles, type OperatorRow, type RoleRow } from "./actions";

const api = adminApi as jest.Mock;
const tekst = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const role: RoleRow[] = [
  { id: "l2", name: "L2 Specjalista techniczny", description: "Wszystko z L1 oraz podgląd konta klienta.", permissions: ["TICKETS_VIEW"], isSystem: true, memberCount: 1 },
  { id: "fin", name: "Finanse i księgowość", description: "Faktury i portfel.", permissions: ["BILLING_MANAGE"], isSystem: true, memberCount: 1 },
  { id: "own", name: "Nocna zmiana", description: null, permissions: ["NODES_VIEW"], isSystem: false, memberCount: 0 },
];
const op = (o: Partial<OperatorRow> = {}): OperatorRow => ({
  id: "op1", email: "jan@verris.pl", firstName: "Jan", lastName: null, role: "STAFF", staffRoleId: "l2", ...o,
});

describe("PB-47 — role operatora w panelu admina", () => {
  beforeEach(() => api.mockReset());

  it("przy operatorze widać wszystkie jego role; bez ról — ostrzeżenie o braku dostępu", () => {
    const html = tekst(renderToStaticMarkup(<WyborRolOperatora operator={op({ roleIds: ["l2", "fin"] })} role={role} />));
    expect(html).toContain("L2 Specjalista techniczny");
    expect(html).toContain("Finanse i księgowość");
    expect(html).toContain("Zmień role");
    expect(tekst(renderToStaticMarkup(<WyborRolOperatora operator={op({ roleIds: [], staffRoleId: null })} role={role} />))).toContain(
      "brak ról (brak dostępu)",
    );
  });

  it("starsze API (samo staffRoleId) i przełączanie roli na liście", () => {
    expect(roleOperatora({ staffRoleId: "l2" })).toEqual(["l2"]);
    expect(roleOperatora({ staffRoleId: null })).toEqual([]);
    expect(roleOperatora({ staffRoleId: "l2", roleIds: ["fin", "l2"] })).toEqual(["fin", "l2"]);
    expect(przelaczRole(["l2"], "fin")).toEqual(["l2", "fin"]);
    expect(przelaczRole(["l2", "fin"], "l2")).toEqual(["fin"]);
  });

  it("lista ról: systemowe oznaczone, z opisem i przyciskiem „Sklonuj” zamiast „Edytuj”", () => {
    const html = renderToStaticMarkup(<RolesClient catalog={[]} initialRoles={role} />);
    const t = tekst(html);
    expect(t.match(/systemowa/g)).toHaveLength(2);
    expect(t.match(/Sklonuj/g)).toHaveLength(2);
    expect(t.match(/Edytuj/g)).toHaveLength(1);
    expect(t).toContain("Wszystko z L1 oraz podgląd konta klienta.");
    // 10.10 — operatorzy (role, blokada) są na /operators i karcie operatora; tu tylko definicja ról.
    expect(html).not.toContain("data-role-operatora");
    expect(html).toContain('href="/operators"');
  });

  it("akcje wołają API: pełna lista ról operatora i klon roli", async () => {
    api.mockResolvedValue({ ok: true });
    await expect(setOperatorRoles("op1", ["l2", "fin"])).resolves.toEqual({ ok: true });
    expect(api).toHaveBeenCalledWith("/admin/staff-roles/operators/op1/roles", { method: "POST", body: { roleIds: ["l2", "fin"] } });
    await cloneRole("l2");
    expect(api).toHaveBeenCalledWith("/admin/staff-roles/l2/clone", { method: "POST", body: {} });
    api.mockRejectedValueOnce(new Error("Wybrana rola nie istnieje."));
    await expect(setOperatorRoles("op1", ["x"])).resolves.toEqual({ ok: false, error: "Wybrana rola nie istnieje." });
  });
});
