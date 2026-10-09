import { akcjeDlaWezlow, akcjeWezlaDlaZapytania, rozbierzZapytanie, szukajAkcjiGlobalnych } from "./szukaj";

const ADMIN = { isAdmin: true, permissions: [] };
const FLOTA_PODGLAD = { isAdmin: false, permissions: ["NODES_VIEW"] };
const aktywny = { id: "n1", status: "ACTIVE" };

describe("Cmd+K — rejestr działań", () => {
  it("„onboard t1” → działanie i węzeł; samo działanie albo sam węzeł — null", () => {
    expect(rozbierzZapytanie("onboard t1")).toEqual({ dzialanie: "onboard", obiekt: "t1" });
    expect(rozbierzZapytanie("t1 drain")).toEqual({ dzialanie: "drain", obiekt: "t1" });
    expect(rozbierzZapytanie("onboard live pl-waw-1")).toEqual({ dzialanie: "onboard live", obiekt: "pl-waw-1" });
    expect(rozbierzZapytanie("onboard")).toBeNull();
    expect(rozbierzZapytanie("t1")).toBeNull();
    expect(rozbierzZapytanie("jan kowalski")).toBeNull();
  });

  it("działania węzła po słowach kluczowych (drain, cordon, waf), tylko w jego stanie", () => {
    expect(akcjeWezlaDlaZapytania(aktywny, "drain", ADMIN).map((a) => a.id)).toEqual(["wycofanie"]);
    expect(akcjeWezlaDlaZapytania(aktywny, "cordon", ADMIN).map((a) => a.id)).toEqual(["nowe-konta"]);
    expect(akcjeWezlaDlaZapytania(aktywny, "waf", ADMIN)[0]).toMatchObject({ id: "waf", href: "/nodes/n1?sekcja=konfiguracja#waf" });
    expect(akcjeWezlaDlaZapytania({ id: "n2", status: "INIT" }, "onboard", ADMIN)).toEqual([]);
    expect(akcjeWezlaDlaZapytania(aktywny, "", ADMIN).length).toBeGreaterThan(10);
  });

  it("bez uprawnień — wyszarzone z powodem, nie ukryte", () => {
    const [onboard] = akcjeWezlaDlaZapytania(aktywny, "onboard", FLOTA_PODGLAD);
    expect(onboard).toMatchObject({ id: "onboard-live", href: "/nodes/n1?sekcja=aktualizacje#onboard-live", zablokowane: "Wymaga NODES_MANAGE" });
    expect(akcjeWezlaDlaZapytania(aktywny, "zadania", FLOTA_PODGLAD)[0]?.zablokowane).toBeNull();
  });

  it("„działanie · węzeł” dla każdego znalezionego węzła", () => {
    const r = akcjeDlaWezlow([{ id: "n1", title: "t1", status: "ACTIVE" }, { id: "n2", title: "t2", status: "INIT" }], "onboard", ADMIN);
    expect(r).toEqual([expect.objectContaining({ id: "n1:onboard-live", nazwa: "Onboard LIVE · t1", href: "/nodes/n1?sekcja=aktualizacje#onboard-live" })]);
  });

  it("działania globalne: Dodaj węzeł, Aktualizuj flotę, Faktura ręczna, Migracja za klienta", () => {
    expect(szukajAkcjiGlobalnych("flote", ADMIN)).toEqual([expect.objectContaining({ id: "aktualizuj-flote", href: "/nodes/stack#aktualizuj-flote", zablokowane: null })]);
    expect(szukajAkcjiGlobalnych("dodaj wezel", FLOTA_PODGLAD)[0]).toMatchObject({ id: "dodaj-wezel", zablokowane: "Wymaga roli administratora" });
    expect(szukajAkcjiGlobalnych("faktura", { isAdmin: false, permissions: ["BILLING_MANAGE"] })[0]).toMatchObject({ id: "faktura-reczna", zablokowane: null });
    expect(szukajAkcjiGlobalnych("za klienta", ADMIN)[0]?.href).toBe("/migrations/za-klienta");
    expect(szukajAkcjiGlobalnych(" ", ADMIN)).toEqual([]);
  });
});
