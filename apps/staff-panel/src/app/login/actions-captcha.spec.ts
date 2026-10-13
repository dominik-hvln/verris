/** Decyzja 14.10 — po progu nieudanych prób API żąda captchy; panel obsługi nie ma widgetu, więc mówi, co zrobić. */
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next/headers", () => ({ headers: async () => new Headers() }));
jest.mock("@/lib/staff-auth-cookie", () => ({ setStaffAuthCookie: jest.fn(), removeStaffAuthCookie: jest.fn() }));

import { staffSubmitLogin } from "./actions";

const formularz = () => {
  const f = new FormData();
  f.set("email", "obsluga@verris.pl");
  f.set("password", "x");
  return f;
};

it("CAPTCHA_WYMAGANA → passkey albo odczekanie; inne 400/401 → nieprawidłowe dane", async () => {
  const fetchMock = jest.fn(async () => new Response(JSON.stringify({ code: "CAPTCHA_WYMAGANA", message: "robot" }), { status: 400 }));
  global.fetch = fetchMock as never;
  expect((await staffSubmitLogin(undefined, formularz())).error).toContain("passkey");
  fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ message: "Invalid credentials" }), { status: 401 }));
  expect((await staffSubmitLogin(undefined, formularz())).error).toBe("Nieprawidłowe dane logowania.");
});
