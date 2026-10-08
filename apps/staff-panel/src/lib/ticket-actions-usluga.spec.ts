/** PB-43 — akcje obsługi: zmiana usługi zgłoszenia i diagnostyka z rozmowy (ścieżki API, komunikaty błędów). */
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
import { staffLinkTicketService, staffTicketDiagnostics } from "./ticket-actions";

beforeEach(() => mockStaffApi.mockReset());

it("zmiana usługi: POST /tickets/admin/:id/usluga; null = odłączenie", async () => {
  mockStaffApi.mockResolvedValue({});
  await expect(staffLinkTicketService("t1", "s2")).resolves.toEqual({ ok: true });
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/t1/usluga", { method: "POST", body: { subscriptionId: "s2" } });
  await staffLinkTicketService("t1", null);
  expect(mockStaffApi).toHaveBeenLastCalledWith("/tickets/admin/t1/usluga", { method: "POST", body: { subscriptionId: null } });
});

it("zmiana usługi odrzucona przez API — komunikat API", async () => {
  mockStaffApi.mockRejectedValue(new StaffApiError("Wskazana usługa nie należy do tego konta.", 400));
  await expect(staffLinkTicketService("t1", "obca")).resolves.toEqual({ error: "Wskazana usługa nie należy do tego konta." });
});

it("diagnostyka: GET /tickets/admin/:id/diagnostyka; błąd → czytelny komunikat zamiast wyjątku", async () => {
  mockStaffApi.mockResolvedValueOnce({ overall: "ok", findings: [] });
  await expect(staffTicketDiagnostics("t1")).resolves.toMatchObject({ ok: true, data: { overall: "ok" } });
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/t1/diagnostyka");
  mockStaffApi.mockRejectedValueOnce(new Error("fetch failed"));
  await expect(staffTicketDiagnostics("t1")).resolves.toEqual({ ok: false, error: "Nie udało się uruchomić diagnostyki." });
});
