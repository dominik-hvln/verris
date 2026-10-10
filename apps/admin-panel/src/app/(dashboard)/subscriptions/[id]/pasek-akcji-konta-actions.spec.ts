/** F2.2 — akcje serwera paska: ścieżki z białej listy, powód przycięty, puste zgłoszenie bez pola, 403 po polsku. */
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi, AdminApiError } from "@/lib/api";
import { akcjaKontaAction, odczytDlaPaskaAction } from "./pasek-akcji-konta-actions";

const api = adminApi as jest.Mock;
beforeEach(() => api.mockReset());

it("akcje trafiają na trasy paska; DNS „zmień/usuń” na osobne ścieżki", async () => {
  api.mockResolvedValue({ ok: true });
  await akcjaKontaAction("s1", "haslo-skrzynki", { email: "jan@klient.pl", powod: "  klient nie pamięta hasła  ", zgloszenie: "  " });
  await akcjaKontaAction("s1", "dns-zmien", { domain: "klient.pl", powod: "klient prosi o zmianę MX", zgloszenie: " #ab12cd34 " });
  await akcjaKontaAction("s1", "dns-usun", { domain: "klient.pl", powod: "klient prosi o usunięcie" });
  expect(api.mock.calls).toEqual([
    ["/admin/subscriptions/s1/konto/akcje/haslo-skrzynki", { method: "POST", body: { email: "jan@klient.pl", powod: "klient nie pamięta hasła" } }],
    ["/admin/subscriptions/s1/konto/akcje/dns/zmien", { method: "POST", body: { domain: "klient.pl", powod: "klient prosi o zmianę MX", zgloszenie: "#ab12cd34" } }],
    ["/admin/subscriptions/s1/konto/akcje/dns/usun", { method: "POST", body: { domain: "klient.pl", powod: "klient prosi o usunięcie" } }],
  ]);
});

it("nieznana akcja albo sekcja — bez wołania API; 403 — nazwa brakującego uprawnienia", async () => {
  expect(await akcjaKontaAction("s1", "zly" as never, { powod: "x".repeat(12) })).toEqual({ ok: false, error: "Nieznana akcja." });
  expect(await odczytDlaPaskaAction("s1", "../users" as never)).toEqual({ ok: false, error: "Nieznana sekcja konta." });
  expect(api).not.toHaveBeenCalled();
  api.mockRejectedValue(new AdminApiError("Forbidden", 403));
  expect(await akcjaKontaAction("s1", "dns-dodaj", { powod: "x".repeat(12) })).toEqual({
    ok: false,
    error: "Twoja rola nie ma uprawnienia „Edycja DNS na koncie klienta (DNS_MANAGE)”.",
  });
  expect(await akcjaKontaAction("s1", "kopia", { powod: "x".repeat(12) })).toEqual({
    ok: false,
    error: "Twoja rola nie ma uprawnienia „Akcje na koncie klienta (ACCOUNT_ACTIONS)”.",
  });
});
