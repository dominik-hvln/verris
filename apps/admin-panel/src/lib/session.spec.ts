/** D1 (10.10) — panel operatora wpuszcza ADMIN i STAFF (zakres STAFF wyznaczają uprawnienia), klienta (USER) — nie. */
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("./auth", () => ({ getAdminAuthToken: jest.fn(async () => "tok") }));
jest.mock("./api", () => {
  class AdminApiError extends Error {
    constructor(m: string, public status: number) {
      super(m);
    }
  }
  return { adminApi: jest.fn(), AdminApiError };
});

import { adminApi, AdminApiError } from "./api";
import { getAdminSession } from "./session";
import { rolaPaneluOperatora } from "./rola-operatora";

const profil = (role: string) => ({ id: "x", email: "x@verris.pl", firstName: null, lastName: null, role });

it.each([
  ["ADMIN", true],
  ["STAFF", true],
  ["USER", false],
])("sesja konta %s → %s", async (role, wpuszcza) => {
  (adminApi as jest.Mock).mockResolvedValue(profil(role));
  const s = await getAdminSession();
  expect(s !== null).toBe(wpuszcza);
});

it("rolaPaneluOperatora: tylko ADMIN i STAFF", () => {
  expect(["ADMIN", "STAFF", "USER", "", null, undefined].map((r) => rolaPaneluOperatora(r as string))).toEqual([true, true, false, false, false, false]);
});

// 14.10 (prod): restart API przy deployu przekierowywał operatora na /login mimo ważnej sesji.
it("401/403 → brak sesji; błąd 502 albo sieci → wyjątek (granica błędu), nie wylogowanie", async () => {
  for (const status of [401, 403]) {
    (adminApi as jest.Mock).mockRejectedValueOnce(new AdminApiError("x", status));
    await expect(getAdminSession()).resolves.toBeNull();
  }
  (adminApi as jest.Mock).mockRejectedValueOnce(new AdminApiError("Bad Gateway", 502));
  await expect(getAdminSession()).rejects.toThrow("Bad Gateway");
  (adminApi as jest.Mock).mockRejectedValueOnce(new TypeError("fetch failed"));
  await expect(getAdminSession()).rejects.toThrow("fetch failed");
});
