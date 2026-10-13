jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("./staff-api", () => {
  class StaffApiError extends Error {
    constructor(m: string, public status: number) {
      super(m);
    }
  }
  return { staffApi: jest.fn(), StaffApiError };
});

import { staffApi, StaffApiError } from "./staff-api";
import { getStaffSession } from "./staff-session";

// 14.10 (prod): chwilowy błąd API przy deployu nie może wyrzucać obsługi na /login.
it("401/403 → brak sesji; 502 albo błąd sieci → wyjątek, nie wylogowanie", async () => {
  for (const status of [401, 403]) {
    (staffApi as jest.Mock).mockRejectedValueOnce(new StaffApiError("x", status));
    await expect(getStaffSession()).resolves.toBeNull();
  }
  (staffApi as jest.Mock).mockRejectedValueOnce(new StaffApiError("Bad Gateway", 502));
  await expect(getStaffSession()).rejects.toThrow("Bad Gateway");
  (staffApi as jest.Mock).mockResolvedValueOnce({ id: "s", email: "s@verris.pl", firstName: null, lastName: null, role: "USER" });
  await expect(getStaffSession()).resolves.toBeNull();
});
