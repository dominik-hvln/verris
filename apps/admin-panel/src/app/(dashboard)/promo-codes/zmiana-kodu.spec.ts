import { doPolaDaty, zbudujZmiane } from "./zmiana-kodu";

const przed = { validTo: null, maxRedemptions: 10, description: "Lato" };
const pole = (o: Partial<{ validTo: string; maxRedemptions: string; description: string }> = {}) => ({
  validTo: "",
  maxRedemptions: "10",
  description: "Lato",
  ...o,
});

describe("B1 — edycja kodu promocyjnego: ciało PATCH", () => {
  it("bez zmian — odmowa, nic nie leci do API", () => {
    expect(zbudujZmiane(przed, pole())).toEqual({ ok: false, blad: "Nic się nie zmieniło." });
  });

  it("wysyła tylko zmienione pola", () => {
    expect(zbudujZmiane(przed, pole({ maxRedemptions: "3" }))).toEqual({ ok: true, zmiana: { maxRedemptions: 3 } });
  });

  it("puste pola zdejmują limit i opis (null)", () => {
    expect(zbudujZmiane(przed, pole({ maxRedemptions: "", description: "  " }))).toEqual({
      ok: true,
      zmiana: { maxRedemptions: null, description: null },
    });
  });

  it("termin: ustawienie i zdjęcie; ten sam termin nie jest zmianą", () => {
    const iso = new Date(2026, 11, 7, 23, 59).toISOString();
    const r = zbudujZmiane(przed, pole({ validTo: "2026-12-07T23:59" }));
    expect(r).toEqual({ ok: true, zmiana: { validTo: iso } });
    const zTerminem = { ...przed, validTo: iso };
    expect(zbudujZmiane(zTerminem, pole({ validTo: doPolaDaty(iso) })).ok).toBe(false);
    expect(zbudujZmiane(zTerminem, pole({ validTo: "" }))).toEqual({ ok: true, zmiana: { validTo: null } });
  });

  it("zły limit — błąd zamiast wysyłki", () => {
    expect(zbudujZmiane(przed, pole({ maxRedemptions: "-1" })).ok).toBe(false);
    expect(zbudujZmiane(przed, pole({ maxRedemptions: "2.5" })).ok).toBe(false);
  });
});
