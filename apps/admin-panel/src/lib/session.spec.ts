/** D1 (10.10) — panel operatora wpuszcza ADMIN i STAFF (zakres STAFF wyznaczają uprawnienia), klienta (USER) — nie. */
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("./auth", () => ({ getAdminAuthToken: jest.fn(async () => "tok") }));
jest.mock("./api", () => ({ adminApi: jest.fn() }));

import { adminApi } from "./api";
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
