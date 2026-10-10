import { dzialaniaObiektu } from "./rejestr";
import { AKCJE_KLIENTA, type KlientDlaAkcji } from "./klient";

const ADMIN = { isAdmin: true, permissions: [] };
const operator = (...permissions: string[]) => ({ isAdmin: false, permissions });
const lista = (k: KlientDlaAkcji, d = ADMIN) => dzialaniaObiektu(AKCJE_KLIENTA, k, d);
const po = (k: KlientDlaAkcji, id: string, d = ADMIN) => lista(k, d).find((x) => x.id === id);

/** Plan E, patch 11 — blokada poczty, reseller, program partnerski i odpowiedź na zgłoszenie były poza kartą klienta. */
describe("Działania klienta", () => {
  it("blokada poczty: tylko gdy jest (albo nie wiadomo); zdjęcie tylko dla admina", () => {
    expect(po({ id: "u1", blokadaPoczty: false }, "blokada-poczty")).toBeUndefined();
    expect(po({ id: "u1", blokadaPoczty: true }, "blokada-poczty")).toMatchObject({ href: "/customers/u1?sekcja=dostepy#blokada-poczty", zablokowane: null });
    expect(po({ id: "u1" }, "blokada-poczty", operator("CUSTOMERS_MANAGE"))?.zablokowane).toBe("Wymaga roli administratora");
  });

  it("reseller na karcie, bez wpisywania ID: nazwa wg stanu, CUSTOMERS_MANAGE", () => {
    expect(po({ id: "u1", reseller: null }, "reseller")).toMatchObject({ nazwa: "Włącz resellera", href: "/customers/u1?sekcja=rozliczenia#reseller" });
    expect(po({ id: "u1", reseller: "PENDING" }, "reseller")?.nazwa).toBe("Zatwierdź resellera");
    expect(po({ id: "u1", reseller: "ACTIVE" }, "reseller", operator("CUSTOMERS_VIEW"))?.zablokowane).toBe("Wymaga CUSTOMERS_MANAGE");
  });

  it("program partnerski: tylko oczekujące zgłoszenie (albo nie wiadomo), PROMO_MANAGE", () => {
    expect(po({ id: "u1", partner: "PENDING" }, "partner")).toMatchObject({ href: "/customers/u1?sekcja=rozliczenia#program-partnerski" });
    expect(po({ id: "u1", partner: "APPROVED" }, "partner")).toBeUndefined();
    expect(po({ id: "u1", partner: null }, "partner")).toBeUndefined();
    expect(po({ id: "u1" }, "partner", operator("CUSTOMERS_VIEW"))?.zablokowane).toBe("Wymaga PROMO_MANAGE");
  });

  it("odpowiedź na zgłoszenie: panel obsługi z ID zgłoszenia (nowa karta); bez otwartych — brak; z Cmd+K — zakładka zgłoszeń", () => {
    expect(po({ id: "u1", otwarteZgloszenie: "t-1", panelObslugi: "https://staff.verris.pl" }, "odpowiedz")).toMatchObject({
      href: "https://staff.verris.pl/tickets/t-1",
      zewnetrzny: true,
    });
    expect(po({ id: "u1", otwarteZgloszenie: null }, "odpowiedz")).toBeUndefined();
    expect(po({ id: "u1" }, "odpowiedz")).toMatchObject({ href: "/customers/u1?sekcja=zgloszenia" });
    expect(po({ id: "u1" }, "odpowiedz")?.zewnetrzny).toBeUndefined();
  });

  it("konto wewnętrzne bez uprawnienia: wyszarzone, ale z wnioskiem (CUSTOMER_INTERNAL_FLAG)", () => {
    expect(po({ id: "u1" }, "konto-wewnetrzne", operator("CUSTOMERS_VIEW"))).toMatchObject({ zablokowane: "Wymaga CUSTOMERS_INTERNAL_FLAG", wniosek: true });
    expect(po({ id: "u1" }, "blokada-logowania", operator("CUSTOMERS_VIEW"))?.wniosek).toBeUndefined();
  });
});
