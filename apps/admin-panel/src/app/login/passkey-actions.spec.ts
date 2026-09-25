jest.mock("@/lib/auth", () => ({ setAdminAuthCookie: jest.fn() }));
jest.mock("@/lib/api", () => ({ API_URL: "http://api.test" }));
import { setAdminAuthCookie } from "@/lib/auth";
import { setAdminPasskeyAuthCookie } from "./passkey-actions";

/** Token z przeglądarki trafia do ciasteczka admina tylko, gdy API potwierdzi rolę ADMIN. */
const ustaw = setAdminAuthCookie as jest.Mock;
const fetchMock = jest.fn();
beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});
beforeEach(() => {
  ustaw.mockReset();
  fetchMock.mockReset();
});

it.each([
  ["ADMIN", true],
  ["STAFF", false],
  ["USER", false],
])("rola %s → %s", async (role, ok) => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ role }) });
  await expect(setAdminPasskeyAuthCookie("tok")).resolves.toBe(ok);
  expect(ustaw).toHaveBeenCalledTimes(ok ? 1 : 0);
});

it("nieważny token (401) → bez ciasteczka", async () => {
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
  await expect(setAdminPasskeyAuthCookie("tok")).resolves.toBe(false);
  expect(ustaw).not.toHaveBeenCalled();
});
