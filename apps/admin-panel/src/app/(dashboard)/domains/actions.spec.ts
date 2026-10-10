/** F2.7 — akcje serwera domen: trasy z białej listy, PUT dla NS, powód przycięty, 403 jako nazwa uprawnienia. */
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi, AdminApiError } from "@/lib/api";
import { akcjaDomenyAction, ponowZamowienieAction, wycenaOdnowieniaAction } from "./actions";

const api = adminApi as jest.Mock;
beforeEach(() => api.mockReset());

it("akcje trafiają na trasy karty domeny; koszt Verris na osobną trasę; NS przez PUT", async () => {
  api.mockResolvedValue({ ok: true });
  await akcjaDomenyAction("d1", "odnow", { years: 2, powod: "  klient prosi o odnowienie  ", zgloszenie: " " });
  await akcjaDomenyAction("d1", "odnow-na-koszt-verris", { years: 1, powod: "nasza awaria odnowienia", zgloszenie: " #ab12cd34 " });
  await akcjaDomenyAction("d1", "ns", { nameservers: ["ns1.a.pl", "ns2.a.pl"], powod: "klient zmienia DNS" });
  expect(api.mock.calls).toEqual([
    ["/admin/domains/d1/odnow", { method: "POST", body: { years: 2, powod: "klient prosi o odnowienie" } }],
    ["/admin/domains/d1/odnow-na-koszt-verris", { method: "POST", body: { years: 1, powod: "nasza awaria odnowienia", zgloszenie: "#ab12cd34" } }],
    ["/admin/domains/d1/ns", { method: "PUT", body: { nameservers: ["ns1.a.pl", "ns2.a.pl"], powod: "klient zmienia DNS" } }],
  ]);
});

it("nieznana akcja — bez API; 403 — nazwa brakującego uprawnienia; inna odmowa — jej treść", async () => {
  expect(await akcjaDomenyAction("d1", "constructor" as never, { powod: "x".repeat(12) })).toEqual({ ok: false, error: "Nieznana akcja." });
  expect(api).not.toHaveBeenCalled();
  api.mockRejectedValue(new AdminApiError("Forbidden", 403));
  expect(await akcjaDomenyAction("d1", "odnow-na-koszt-verris", { powod: "x".repeat(12) })).toEqual({
    ok: false,
    error: "Twoja rola nie ma uprawnienia DOMAINS_MANAGE i BILLING_MANAGE.",
  });
  api.mockRejectedValue(new AdminApiError("Personel może zmieniać wyłącznie domeny klientów — domenę konta zespołu zmienia administrator.", 403));
  expect(await akcjaDomenyAction("d1", "kod-epp", { powod: "x".repeat(12) })).toEqual({
    ok: false,
    error: "Personel może zmieniać wyłącznie domeny klientów — domenę konta zespołu zmienia administrator.",
  });
});

it("ponowienie: nowy kod EPP tylko gdy podany; wycena z okresem w granicach 1–10", async () => {
  api.mockResolvedValue({ id: "z2", status: "COMPLETED" });
  await ponowZamowienieAction("o1", { powod: " rejestr miał przerwę ", zgloszenie: "", authCode: "  " });
  await ponowZamowienieAction("o2", { powod: "zły kod przy transferze", authCode: " NOWY " });
  await wycenaOdnowieniaAction("d1", 50);
  expect(api.mock.calls).toEqual([
    ["/admin/domains/zamowienia/o1/ponow", { method: "POST", body: { powod: "rejestr miał przerwę" } }],
    ["/admin/domains/zamowienia/o2/ponow", { method: "POST", body: { powod: "zły kod przy transferze", authCode: "NOWY" } }],
    ["/admin/domains/d1/odnowienie-wycena?lata=10"],
  ]);
});
