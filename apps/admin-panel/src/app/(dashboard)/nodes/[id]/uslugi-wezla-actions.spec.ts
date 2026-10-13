/** F3.4 — akcje serwera usług i logów węzła: stałe trasy, ciała, 403 WYMAGA_WNIOSKU → propozycja wniosku. */
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {
    constructor(message: string, public status: number, public body?: unknown) {
      super(message);
    }
  }
  return { AdminApiError, adminApi: jest.fn() };
});

import { adminApi, AdminApiError } from "@/lib/api";
import { uslugiWezlaAction } from "./uslugi-wezla-actions";

const api = adminApi as jest.Mock;
beforeEach(() => api.mockReset());

it("trasy: stan, sprawdź, restart, restart wspólnej z potwierdzeniem, log z filtrem", async () => {
  api.mockResolvedValue({});
  await uslugiWezlaAction("w1", "stan");
  await uslugiWezlaAction("w1", "sprawdz");
  await uslugiWezlaAction("w1", "restart", { usluga: "fail2ban", powod: " fail2ban wisi od rana " });
  await uslugiWezlaAction("w1", "restart-wspolnej", { usluga: "exim", powod: "kolejka stoi", potwierdzenie: " fra-01 " });
  await uslugiWezlaAction("w1", "log", { log: "exim-main", linie: 100, filtr: " 1abc " });
  await uslugiWezlaAction("w1", "log", { log: "www", linie: 200, filtr: "  " });
  await uslugiWezlaAction("w1", "log", { log: "www-domena", linie: 50, domena: " firma.pl ", uzytkownik: "", od: "2026-10-14T00:00:00.000Z" });
  expect(api.mock.calls).toEqual([
    ["/admin/servers/w1/uslugi"],
    ["/admin/servers/w1/uslugi/sprawdz", { method: "POST", body: {} }],
    ["/admin/servers/w1/uslugi/restart", { method: "POST", body: { usluga: "fail2ban", powod: "fail2ban wisi od rana" } }],
    ["/admin/servers/w1/uslugi/restart-wspolnej", { method: "POST", body: { usluga: "exim", powod: "kolejka stoi", potwierdzenie: "fra-01" } }],
    ["/admin/servers/w1/uslugi/log", { method: "POST", body: { log: "exim-main", linie: 100, filtr: "1abc" } }],
    ["/admin/servers/w1/uslugi/log", { method: "POST", body: { log: "www", linie: 200 } }],
    ["/admin/servers/w1/uslugi/log", { method: "POST", body: { log: "www-domena", linie: 50, domena: "firma.pl", od: "2026-10-14T00:00:00.000Z" } }],
  ]);
});

it("403 WYMAGA_WNIOSKU — propozycja wniosku; inne 403 — nazwa uprawnienia; nieznana akcja bez API", async () => {
  api.mockRejectedValueOnce(new AdminApiError("Twoja rola nie ma uprawnień do tej operacji.", 403, { code: "WYMAGA_WNIOSKU", operacja: "NODE_SERVICE_RESTART" }));
  expect(await uslugiWezlaAction("w1", "restart-wspolnej", { usluga: "exim" })).toMatchObject({ ok: false, wniosek: true });
  api.mockRejectedValueOnce(new AdminApiError("Forbidden", 403));
  expect(await uslugiWezlaAction("w1", "stan")).toEqual({ ok: false, error: "Twoja rola nie ma uprawnienia „Usługi i logi węzła (NODE_SERVICES)”." });
  api.mockReset();
  expect(await uslugiWezlaAction("w1", "stop" as never)).toEqual({ ok: false, error: "Nieznana akcja." });
  expect(api).not.toHaveBeenCalled();
});
