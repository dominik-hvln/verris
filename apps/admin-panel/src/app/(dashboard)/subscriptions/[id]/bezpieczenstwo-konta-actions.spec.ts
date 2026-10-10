/** F3.2 — akcje serwera sekcji „Bezpieczeństwo konta”: trasy z białej listy, ciała bez zbędnych pól, 403 po polsku. */
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi, AdminApiError } from "@/lib/api";
import { odczytBezpieczenstwaAction, zapisBezpieczenstwaAction } from "./bezpieczenstwo-konta-actions";

const api = adminApi as jest.Mock;
beforeEach(() => api.mockReset());

it("trasy: odczyty, sprawdź i odblokuj IP, kwarantanna, przywrócenie, wczytanie WAF", async () => {
  api.mockResolvedValue({});
  await odczytBezpieczenstwaAction("s1", "blokady-ip");
  await odczytBezpieczenstwaAction("s1", "malware");
  await odczytBezpieczenstwaAction("s1", "waf");
  await zapisBezpieczenstwaAction("s1", "sprawdz-ip", { ip: " 83.12.44.201 ", powod: "nieużywany" });
  await zapisBezpieczenstwaAction("s1", "odblokuj-ip", { ip: "83.12.44.201", powod: "  klient nie odbiera poczty ", zgloszenie: " #ab12cd34 " });
  await zapisBezpieczenstwaAction("s1", "kwarantanna", { sciezki: ["domains/k.pl/public_html/x.php"], powod: "backdoor w uploads" });
  await zapisBezpieczenstwaAction("s1", "przywroc", { wpisy: ["w1"], powod: "fałszywy alarm", zgloszenie: " " });
  await zapisBezpieczenstwaAction("s1", "wczytaj-waf", { powod: "nieużywany" });
  expect(api.mock.calls).toEqual([
    ["/admin/subscriptions/s1/konto/blokady-ip"],
    ["/admin/subscriptions/s1/konto/malware"],
    ["/admin/subscriptions/s1/konto/waf"],
    ["/admin/subscriptions/s1/konto/blokady-ip/sprawdz", { method: "POST", body: { ip: "83.12.44.201" } }],
    ["/admin/subscriptions/s1/konto/blokady-ip/odblokuj", { method: "POST", body: { ip: "83.12.44.201", powod: "klient nie odbiera poczty", zgloszenie: "#ab12cd34" } }],
    ["/admin/subscriptions/s1/konto/akcje/kwarantanna", { method: "POST", body: { sciezki: ["domains/k.pl/public_html/x.php"], powod: "backdoor w uploads" } }],
    ["/admin/subscriptions/s1/konto/akcje/kwarantanna/przywroc", { method: "POST", body: { wpisy: ["w1"], powod: "fałszywy alarm" } }],
    ["/admin/subscriptions/s1/konto/waf", { method: "POST", body: {} }],
  ]);
});

it("nieznana akcja albo sekcja — bez API; 403 strażnika — nazwa uprawnienia; odmowa serwisu — jej treść", async () => {
  expect(await zapisBezpieczenstwaAction("s1", "constructor" as never, {})).toEqual({ ok: false, error: "Nieznana akcja." });
  expect(await odczytBezpieczenstwaAction("s1", "../../users" as never)).toEqual({ ok: false, error: "Nieznana sekcja." });
  expect(api).not.toHaveBeenCalled();
  api.mockRejectedValueOnce(new AdminApiError("Forbidden", 403));
  expect(await zapisBezpieczenstwaAction("s1", "odblokuj-ip", { ip: "1.2.3.4", powod: "x".repeat(12) })).toEqual({
    ok: false,
    error: "Twoja rola nie ma uprawnienia „Odblokowanie IP klienta (IP_UNBLOCK)”.",
  });
  api.mockRejectedValueOnce(new AdminApiError("Adres nie pochodzi z logowań klienta ani z tego zgłoszenia — odblokuje go NOC.", 403));
  expect(await zapisBezpieczenstwaAction("s1", "odblokuj-ip", { ip: "1.2.3.4", powod: "x".repeat(12) })).toEqual({
    ok: false,
    error: "Adres nie pochodzi z logowań klienta ani z tego zgłoszenia — odblokuje go NOC.",
  });
});
