/** F2.5 — zgłoszenie w imieniu klienta: klient po id (karta) albo po e-mailu (skrzynka), nigdy oba naraz. */
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
import { staffCreateTicketOnBehalf } from "./ticket-actions";

const fd = (pola: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(pola)) f.append(k, v);
  return f;
};
const tresc = { subject: "Awaria poczty", message: "Wykryliśmy problem z pocztą na koncie.", priority: "HIGH", department: "TECHNICAL" };

beforeEach(() => mockStaffApi.mockReset().mockResolvedValue({ id: "t9" }));

it("z e-mailem: POST /tickets/admin/w-imieniu z email, zwraca id", async () => {
  await expect(staffCreateTicketOnBehalf(fd({ ...tresc, email: " jan@firma.pl " }))).resolves.toEqual({ ok: true, id: "t9" });
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/w-imieniu", { method: "POST", body: { ...tresc, email: "jan@firma.pl" } });
});

it("z karty: userId ma pierwszeństwo, e-mail nie idzie", async () => {
  await staffCreateTicketOnBehalf(fd({ ...tresc, userId: "u1", email: "x@y.pl" }));
  expect(mockStaffApi).toHaveBeenCalledWith("/tickets/admin/w-imieniu", { method: "POST", body: { ...tresc, userId: "u1" } });
});

it("bez klienta — komunikat bez API; błąd API — jego komunikat", async () => {
  await expect(staffCreateTicketOnBehalf(fd(tresc))).resolves.toEqual({ error: "Podaj e-mail klienta." });
  expect(mockStaffApi).not.toHaveBeenCalled();
  mockStaffApi.mockRejectedValue(new StaffApiError("Nie znaleziono konta klienta.", 404));
  await expect(staffCreateTicketOnBehalf(fd({ ...tresc, email: "nikt@x.pl" }))).resolves.toEqual({ error: "Nie znaleziono konta klienta." });
});
