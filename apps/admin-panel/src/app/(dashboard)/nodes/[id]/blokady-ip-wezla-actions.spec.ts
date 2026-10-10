/** F3.2 — akcje serwera blokad IP węzła: stałe trasy, ciała z adresem i powodem, 403 po polsku. */
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi, AdminApiError } from "@/lib/api";
import { blokadyIpWezlaAction } from "./blokady-ip-wezla-actions";

const api = adminApi as jest.Mock;
beforeEach(() => api.mockReset());

it("trasy: stan, wczytaj, odblokuj, biała lista dodaj/usuń", async () => {
  api.mockResolvedValue({});
  await blokadyIpWezlaAction("w1", "stan");
  await blokadyIpWezlaAction("w1", "wczytaj");
  await blokadyIpWezlaAction("w1", "odblokuj", { ip: " 203.0.113.7 ", powod: " biuro klienta za NAT " });
  await blokadyIpWezlaAction("w1", "dodaj", { ip: "198.51.100.9", powod: "monitoring partnera" });
  await blokadyIpWezlaAction("w1", "usun", { ip: "198.51.100.9", powod: "koniec umowy z partnerem" });
  expect(api.mock.calls).toEqual([
    ["/admin/servers/w1/blokady-ip"],
    ["/admin/servers/w1/blokady-ip/wczytaj", { method: "POST", body: {} }],
    ["/admin/servers/w1/blokady-ip/odblokuj", { method: "POST", body: { ip: "203.0.113.7", powod: "biuro klienta za NAT" } }],
    ["/admin/servers/w1/blokady-ip/biala-lista", { method: "POST", body: { ip: "198.51.100.9", powod: "monitoring partnera", akcja: "dodaj" } }],
    ["/admin/servers/w1/blokady-ip/biala-lista", { method: "POST", body: { ip: "198.51.100.9", powod: "koniec umowy z partnerem", akcja: "usun" } }],
  ]);
});

it("nieznana akcja — bez API; 403 — nazwa uprawnienia", async () => {
  expect(await blokadyIpWezlaAction("w1", "restart" as never)).toEqual({ ok: false, error: "Nieznana akcja." });
  expect(api).not.toHaveBeenCalled();
  api.mockRejectedValue(new AdminApiError("Forbidden", 403));
  expect(await blokadyIpWezlaAction("w1", "stan")).toEqual({ ok: false, error: "Twoja rola nie ma uprawnienia „Blokady IP węzła (IP_BLOCKS_NODE)”." });
});
