import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/lib/staff-access", () => ({ fetchStaffAccess: jest.fn() }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));
jest.mock("../fleet-update-button", () => ({ FleetUpdateButton: () => <button data-op="aktualizuj" /> }));
jest.mock("./wersje-stosu", () => ({ WersjeStosu: () => <section data-op="manifest" /> }));
jest.mock("./pakiety-floty", () => ({ PakietyFlotyPanel: () => <div data-op="pakiety" /> }));

import { adminApi } from "@/lib/api";
import { fetchStaffAccess } from "@/lib/staff-access";
import OperacjeFlotyPage from "./page";

/** 10.10 — operacje na całej flocie były w trzech miejscach (lista węzłów, „Wersje stosu”, karta planu). */
describe("Flota → Operacje floty", () => {
  beforeEach(() => jest.clearAllMocks());

  it("administrator: aktualizacja, manifest z wyrównaniem i pakiety na jednej stronie, z kotwicami Cmd+K", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValueOnce({ role: "ADMIN", isAdmin: true, permissions: [] });
    (adminApi as jest.Mock).mockResolvedValueOnce({ manifest: {}, dozwolone: {}, wezly: [] });
    const html = renderToStaticMarkup(await OperacjeFlotyPage());
    expect(adminApi).toHaveBeenCalledWith("/admin/stack-manifest");
    for (const op of ["aktualizuj", "manifest", "pakiety"]) expect(html).toContain(`data-op="${op}"`);
    expect(html).toContain('id="aktualizuj-flote"');
    expect(html).toContain('id="pakiety"');
  });

  it("operator z NODES_MANAGE: aktualizuje flotę; manifest i pakiety (w API tylko ADMIN) wyszarzone, bez zapytania o manifest", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValueOnce({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW", "NODES_MANAGE"] });
    const html = renderToStaticMarkup(await OperacjeFlotyPage());
    expect(adminApi).not.toHaveBeenCalled();
    expect(html).toContain('data-op="aktualizuj"');
    expect(html).not.toContain('data-op="manifest"');
    expect(html).not.toContain('data-op="pakiety"');
    expect(html).toContain('title="Wymaga roli administratora"');
  });

  it("operator bez NODES_MANAGE: wszystko wyszarzone z powodem", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValueOnce({ role: "STAFF", isAdmin: false, permissions: ["NODES_VIEW"] });
    const html = renderToStaticMarkup(await OperacjeFlotyPage());
    expect(html).not.toContain('data-op="aktualizuj"');
    expect(html).toContain('title="Wymaga NODES_MANAGE"');
  });
});
