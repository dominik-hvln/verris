/** F2.5 — eskalacja z cofnięciem, tagi, kroki runbooka: ścieżki API i komunikaty błędów. */
const mockStaffApi = jest.fn();
jest.mock("./staff-api", () => {
  class StaffApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { StaffApiError, staffApi: (...a: unknown[]) => mockStaffApi(...a), staffApiMultipart: jest.fn() };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { StaffApiError } from "./staff-api";
import { staffListTags, staffRunbookSteps, staffSetRiskFlag, staffSetTags, staffUndoEscalation } from "./ticket-actions";

beforeEach(() => mockStaffApi.mockReset().mockResolvedValue({ tags: ["vip"] }));

it("cofnięcie eskalacji: POST …/escalate/cofnij z powodem; błąd API — jego komunikat", async () => {
  await expect(staffUndoEscalation("t1", "Rozwiązane na L2")).resolves.toEqual({ ok: true });
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/t1/escalate/cofnij", { method: "POST", body: { reason: "Rozwiązane na L2" } });
  mockStaffApi.mockRejectedValue(new StaffApiError("Zgłoszenie nie jest eskalowane.", 400));
  await expect(staffUndoEscalation("t1", "Rozwiązane na L2")).resolves.toEqual({ error: "Zgłoszenie nie jest eskalowane." });
});

it("zdjęcie flagi: riskFlag null, powód w riskReason", async () => {
  await staffSetRiskFlag("t1", "", "Rozmowa z klientem, zostaje");
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/t1/risk", { method: "POST", body: { riskFlag: null, riskReason: "Rozmowa z klientem, zostaje" } });
});

it("tagi: cała lista na …/tagi; lista w użyciu przy błędzie pusta", async () => {
  await expect(staffSetTags("t1", ["vip"])).resolves.toEqual({ ok: true, tags: ["vip"] });
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/t1/tagi", { method: "POST", body: { tagi: ["vip"] } });
  mockStaffApi.mockRejectedValue(new Error("down"));
  await expect(staffListTags()).resolves.toEqual([]);
});

it("kroki runbooka: klucz i numery kroków", async () => {
  await expect(staffRunbookSteps("t1", "poczta", [0, 2])).resolves.toEqual({ ok: true });
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/t1/runbook/kroki", { method: "POST", body: { runbookKey: "poczta", kroki: [0, 2] } });
});
