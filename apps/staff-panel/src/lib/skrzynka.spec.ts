import { czyFiltry, linkStrony, zapytanieSkrzynki } from "./skrzynka";

/** F2.5 — skrzynka: widok i filtry z formularza → zapytanie do API; stronicowanie zachowuje filtry. */
describe("skrzynka — zapytanie do API", () => {
  it("domyślnie otwarte, sort „termin”, 50 na stronę", () => {
    expect(zapytanieSkrzynki({})).toEqual({ stan: "otwarte", sort: "termin", limit: "50" });
  });
  it("„Moje” = przypisane do mnie; „Czeka” = stan WAITING_CUSTOMER", () => {
    expect(zapytanieSkrzynki({ widok: "moje" })).toMatchObject({ stan: "otwarte", przypisany: "ja" });
    expect(zapytanieSkrzynki({ widok: "czeka" })).toMatchObject({ stan: "WAITING_CUSTOMER" });
  });
  it("filtry z formularza przechodzą do API (puste pomijane), strona > 1", () => {
    expect(zapytanieSkrzynki({ q: " 500 ", priorytet: "URGENT", tag: "", sla: "po-terminie", userId: "u1", page: "3" })).toEqual({
      stan: "otwarte", sort: "termin", limit: "50", q: "500", priorytet: "URGENT", sla: "po-terminie", userId: "u1", page: "3",
    });
    expect(zapytanieSkrzynki({ page: "1" }).page).toBeUndefined();
    expect(zapytanieSkrzynki({ page: "abc" }).page).toBeUndefined();
  });
  it("link strony zachowuje widok i filtry, strona 1 bez parametru", () => {
    expect(linkStrony({ widok: "moje", q: "dns", page: "2" }, 3)).toBe("/?widok=moje&q=dns&page=3");
    expect(linkStrony({ widok: "moje", page: "2" }, 1)).toBe("/?widok=moje");
    expect(linkStrony({}, 1)).toBe("/");
    expect(linkStrony({ q: "x" }, 2, "/tickets/closed")).toBe("/tickets/closed?q=x&page=2");
  });
  it("czyFiltry: filtr klienta (z karty) nie liczy się jako „wyczyść filtry”", () => {
    expect(czyFiltry({ userId: "u1" })).toBe(false);
    expect(czyFiltry({ tag: "vip" })).toBe(true);
  });
});
