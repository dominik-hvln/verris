/** Decyzja 14.10 — po progu nieudanych prób API żąda captchy; panel operatora nie ma widgetu, więc mówi, co zrobić. */
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("./auth", () => ({ setAdminAuthCookie: jest.fn(), removeAdminAuthCookie: jest.fn() }));
jest.mock("./api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number, public body?: unknown) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi, AdminApiError } from "./api";
import { adminLogin } from "./auth-actions";

it("CAPTCHA_WYMAGANA → passkey albo odczekanie, nie komunikat o robocie bez widgetu", async () => {
  (adminApi as jest.Mock).mockRejectedValueOnce(new AdminApiError("potwierdź, że nie jesteś robotem", 400, { code: "CAPTCHA_WYMAGANA" }));
  expect((await adminLogin("admin@verris.pl", "x")).error).toContain("passkey");
  (adminApi as jest.Mock).mockRejectedValueOnce(new AdminApiError("Invalid credentials", 401));
  expect((await adminLogin("admin@verris.pl", "x")).error).toBe("Invalid credentials");
});
