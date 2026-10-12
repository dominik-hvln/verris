/** M-33 — zamknięcie zlecenia dodatku: właściwa trasa i ciało; odmowa bez powodu nie idzie do API; błąd API (409) wraca. */
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
import { staffZamknijZlecenieDodatku } from "./ticket-actions";

beforeEach(() => mockStaffApi.mockReset().mockResolvedValue({ note: "Zlecenie zamknięte." }));

it("„Zrealizowano” — /zrealizowano z notatką albo bez", async () => {
  await expect(staffZamknijZlecenieDodatku("t1", "z1", "ZREALIZOWANO", "  Przydzielono IP 203.0.113.10 ")).resolves.toEqual({ ok: true, note: "Zlecenie zamknięte." });
  expect(mockStaffApi).toHaveBeenLastCalledWith("/admin/dodatki/z1/zrealizowano", { method: "POST", body: { notatka: "Przydzielono IP 203.0.113.10" } });
  await staffZamknijZlecenieDodatku("t1", "z1", "ZREALIZOWANO", "");
  expect(mockStaffApi).toHaveBeenLastCalledWith("/admin/dodatki/z1/zrealizowano", { method: "POST", body: {} });
});

it("„Odmowa ze zwrotem” — /odmowa z powodem; za krótki powód — bez API; 409 wraca jako błąd", async () => {
  await staffZamknijZlecenieDodatku("t1", "z1", "ODMOWA", "Pula adresów IP jest wyczerpana.");
  expect(mockStaffApi).toHaveBeenLastCalledWith("/admin/dodatki/z1/odmowa", { method: "POST", body: { powod: "Pula adresów IP jest wyczerpana." } });
  mockStaffApi.mockClear();
  expect(await staffZamknijZlecenieDodatku("t1", "z1", "ODMOWA", "brak")).toEqual({ error: expect.stringContaining("min. 10 znaków") });
  expect(mockStaffApi).not.toHaveBeenCalled();
  mockStaffApi.mockRejectedValueOnce(new (StaffApiError as unknown as new (m: string, s: number) => Error)("Tego zlecenia nie da się już zamknąć", 409));
  expect(await staffZamknijZlecenieDodatku("t1", "z1", "ODMOWA", "Pula adresów IP jest wyczerpana.")).toEqual({ error: "Tego zlecenia nie da się już zamknąć" });
});
