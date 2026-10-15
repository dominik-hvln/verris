import { renderToStaticMarkup } from "react-dom/server";

const adminApi = jest.fn();
jest.mock("@/lib/api", () => {
  class AdminApiError extends Error {}
  return { AdminApiError, adminApi: (...a: unknown[]) => adminApi(...a) };
});

import { AdminApiError } from "@/lib/api";
import { fetchKsefZalegle, zakolejkujKsefZalegle } from "./actions";
import { KsefZalegleSekcja } from "./ksef-zalegle";

/** Przegląd 15.10 — faktury VAT panelu sprzed okna automatu KSeF (7 dni), których nie ma w kolejce. */
describe("KSeF — zaległe faktury", () => {
  beforeEach(() => adminApi.mockReset());

  it("akcje: podgląd GET /admin/ksef/zalegle, kolejkowanie POST z liczbą z podglądu; błąd API → komunikat", async () => {
    adminApi.mockResolvedValue({ liczba: 2, przyklady: [] });
    expect(await fetchKsefZalegle()).toEqual({ data: { liczba: 2, przyklady: [] } });
    expect(adminApi).toHaveBeenCalledWith("/admin/ksef/zalegle");
    adminApi.mockResolvedValue({ zakolejkowane: 2, srodowisko: "prod" });
    await zakolejkujKsefZalegle(2);
    expect(adminApi).toHaveBeenLastCalledWith("/admin/ksef/zalegle", { method: "POST", body: { oczekiwanaLiczba: 2 } });
    adminApi.mockRejectedValue(new AdminApiError("Liczba zaległych faktur zmieniła się"));
    expect(await zakolejkujKsefZalegle(2)).toEqual({ error: "Liczba zaległych faktur zmieniła się" });
  });

  const zalegle = { liczba: 12, przyklady: [{ id: "f1", number: "VFV/2026/09/0001", issuedAt: "2026-09-01T10:00:00.000Z" }] };

  it("brak zaległych — nic się nie pokazuje", () => {
    expect(renderToStaticMarkup(<KsefZalegleSekcja zalegle={{ liczba: 0, przyklady: [] }} env="prod" enabled onDone={() => undefined} />)).toBe("");
  });

  it("zaległe: liczba, link do faktury, reszta policzona; przycisk ze środowiskiem tylko przy włączonym KSeF", () => {
    const html = renderToStaticMarkup(<KsefZalegleSekcja zalegle={zalegle} env="prod" enabled onDone={() => undefined} />);
    expect(html).toContain("Faktury VAT poza KSeF: 12");
    expect(html).toContain('href="/invoices/f1#ksef"');
    expect(html).toContain("…i 11 więcej");
    expect(html).toContain("Zakolejkuj do KSeF PRODUKCYJNE…");
    const wyl = renderToStaticMarkup(<KsefZalegleSekcja zalegle={zalegle} env="prod" enabled={false} onDone={() => undefined} />);
    expect(wyl).not.toContain("Zakolejkuj");
    expect(wyl).toContain("Najpierw włącz wysyłkę do KSeF");
  });
});
