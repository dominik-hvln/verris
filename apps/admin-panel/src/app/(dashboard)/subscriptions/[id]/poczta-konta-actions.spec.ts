/** F3.1 — akcje serwera sekcji „Poczta”: trasy z białej listy, ciała bez zbędnych pól, 403 po polsku. */
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi, AdminApiError } from "@/lib/api";
import { odczytPocztyAction, zapisPocztyAction } from "./poczta-konta-actions";

const api = adminApi as jest.Mock;
beforeEach(() => api.mockReset());

it("trasy: stan wysyłki, kolejka, blokada, odczyt z frazą, usunięcie z identyfikatorami", async () => {
  api.mockResolvedValue({});
  await odczytPocztyAction("s1", "wysylka");
  await odczytPocztyAction("s1", "kolejka");
  await zapisPocztyAction("s1", "zablokuj", { powod: "  spam z formularza  ", zgloszenie: " " });
  await zapisPocztyAction("s1", "wczytaj", { szukaj: " gmail ", powod: "nieużywany" });
  await zapisPocztyAction("s1", "usun", { powod: "spam z formularza", ids: ["1aBcDe-0003hL-9u"] });
  expect(api.mock.calls).toEqual([
    ["/admin/subscriptions/s1/konto/wysylka"],
    ["/admin/subscriptions/s1/konto/kolejka-poczty"],
    ["/admin/subscriptions/s1/konto/wysylka/zablokuj", { method: "POST", body: { powod: "spam z formularza" } }],
    ["/admin/subscriptions/s1/konto/kolejka-poczty/wczytaj", { method: "POST", body: { szukaj: "gmail" } }],
    ["/admin/subscriptions/s1/konto/kolejka-poczty/usun", { method: "POST", body: { powod: "spam z formularza", ids: ["1aBcDe-0003hL-9u"] } }],
  ]);
});

it("nieznana akcja albo sekcja — bez API; 403 — nazwa uprawnienia", async () => {
  expect(await zapisPocztyAction("s1", "constructor" as never, {})).toEqual({ ok: false, error: "Nieznana akcja." });
  expect(await odczytPocztyAction("s1", "../users" as never)).toEqual({ ok: false, error: "Nieznana sekcja poczty." });
  expect(api).not.toHaveBeenCalled();
  api.mockRejectedValue(new AdminApiError("Forbidden", 403));
  expect(await zapisPocztyAction("s1", "usun", { powod: "x".repeat(12), ids: [] })).toEqual({
    ok: false,
    error: "Twoja rola nie ma uprawnienia „Usunięcie wiadomości konta z kolejki (MAIL_SEND_BLOCK)”.",
  });
});
