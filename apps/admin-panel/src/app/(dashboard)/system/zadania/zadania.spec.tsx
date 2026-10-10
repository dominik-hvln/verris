import { renderToStaticMarkup } from "react-dom/server";

// D1 — bramka strony (uprawnienia z mapy STRONY) ma własne testy (uprawnienia-stron.spec.tsx); tu treść strony.
jest.mock("@/lib/bramka-strony", () => ({ bramkaStrony: async () => null }));
jest.mock("@/lib/api", () => ({ AdminApiError: class extends Error {}, adminApi: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }), usePathname: () => "/system/zadania" }));
jest.mock("./actions", () => ({ uruchomZadanie: jest.fn() }));

import { adminApi } from "@/lib/api";
import ZadaniaWTlePage from "./page";
import { czasTrwania, posortuj, type StanZadania } from "./dane";

/** F2.8 — System → Zadania w tle (GET /admin/zadania-w-tle). */
const api = adminApi as jest.Mock;
const zadanie = (o: Partial<StanZadania>): StanZadania => ({
  klucz: "X.y",
  nazwa: null,
  harmonogram: "0 * * * *",
  strefa: null,
  ostatni: { start: "2026-10-10T10:00:00Z", koniec: "2026-10-10T10:00:02Z", czasMs: 2100, ok: true, blad: null, reczne: false },
  ostatniBlad: null,
  nastepny: "2026-10-10T11:00:00Z",
  trwaOd: null,
  zalegle: false,
  mozeUruchomic: false,
  ...o,
});

describe("zadania w tle", () => {
  it("kolejność: najpierw zaległe, potem z błędem, bez przebiegu, sprawne", () => {
    const lista = [
      zadanie({ klucz: "A.ok" }),
      zadanie({ klucz: "B.brak", ostatni: null }),
      zadanie({ klucz: "C.blad", ostatni: { start: "2026-10-10T10:00:00Z", koniec: "2026-10-10T10:00:00Z", czasMs: 5, ok: false, blad: "x", reczne: false } }),
      zadanie({ klucz: "D.zalegle", zalegle: true }),
    ];
    expect(posortuj(lista).map((z) => z.klucz)).toEqual(["D.zalegle", "C.blad", "B.brak", "A.ok"]);
    expect([czasTrwania(450), czasTrwania(2100), czasTrwania(125_000)]).toEqual(["450 ms", "2 s", "2 min 5 s"]);
  });

  it("strona: alert o zaległym, ostatni błąd z treścią, przycisk tylko przy mozeUruchomic", async () => {
    api.mockResolvedValue([
      zadanie({ klucz: "RenewalScheduler.handleHourlyTick", nazwa: "subscriptions:renewal-cycle", zalegle: true }),
      zadanie({ klucz: "ProbeScheduler.tick", mozeUruchomic: true, ostatniBlad: { start: "2026-10-09T10:00:00Z", blad: "ECONNRESET" } }),
    ]);
    const html = renderToStaticMarkup(await ZadaniaWTlePage());
    expect(html).toContain('data-alert="zalegle"');
    expect(html).toContain("1 zadanie nie biegło od dwóch terminów");
    expect(html).toContain("nie biegnie");
    expect(html).toContain("ECONNRESET");
    const wiersze = html.split("data-zadanie=");
    expect(wiersze.find((w) => w.startsWith('"ProbeScheduler.tick"'))).toContain("Uruchom teraz");
    expect(wiersze.find((w) => w.startsWith('"RenewalScheduler.handleHourlyTick"'))).not.toContain("Uruchom teraz");
  });

  it("błąd API: strona błędu, nie pusta lista", async () => {
    api.mockRejectedValue(new Error("403"));
    expect(renderToStaticMarkup(await ZadaniaWTlePage())).not.toContain("Brak zadań");
  });
});
