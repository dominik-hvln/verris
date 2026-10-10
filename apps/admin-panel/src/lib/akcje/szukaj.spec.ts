import { akcjeDlaWezlow, akcjeObiektuDlaZapytania, akcjeWezlaDlaZapytania, rozbierzZapytanie, szukajAkcjiGlobalnych } from "./szukaj";

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

describe("Cmd+K — tryb obiekt → działanie dla klienta, usługi i faktury (plan E, patche 9–11)", () => {
  const ids = (o: Parameters<typeof akcjeObiektuDlaZapytania>[0], q = "", d = ADMIN) => akcjeObiektuDlaZapytania(o, q, d).map((a) => a.id);

  it("klient: działania z karty, w tym reseller, blokada poczty i program partnerski; odpowiedź → zakładka zgłoszeń", () => {
    const r = akcjeObiektuDlaZapytania({ type: "user", id: "u1" }, "", ADMIN);
    for (const id of ["reseller", "blokada-poczty", "partner", "odpowiedz", "kredyty"]) expect(r.map((a) => a.id)).toContain(id);
    expect(r.find((a) => a.id === "odpowiedz")?.href).toBe("/customers/u1?sekcja=zgloszenia");
    expect(ids({ type: "user", id: "u1" }, "narzut")).toEqual(["reseller"]);
    expect(ids({ type: "user", id: "u1" }, "spam")).toEqual(["blokada-poczty"]);
  });

  it("usługa: ponowienie zakładania tylko w PROVISIONING; karta klienta z właściciela", () => {
    expect(ids({ type: "service", id: "s1", status: "PROVISIONING", userId: "u1" })).toContain("zakladanie");
    expect(ids({ type: "service", id: "s1", status: "ACTIVE", userId: "u1" })).not.toContain("zakladanie");
    // Przegląd 10.10: zakładanie w toku — sekcji #zakladanie na karcie nie ma; wyszukiwarka mówi, czy padło.
    expect(ids({ type: "service", id: "s1", status: "PROVISIONING", zakladanieNieudane: false, userId: "u1" })).not.toContain("zakladanie");
    expect(ids({ type: "service", id: "s1", status: "PROVISIONING", zakladanieNieudane: true, userId: "u1" })).toContain("zakladanie");
    expect(akcjeObiektuDlaZapytania({ type: "service", id: "s1", status: "ACTIVE", userId: "u1" }, "właściciel", ADMIN)[0]?.href).toBe("/customers/u1");
  });

  it("faktura: korekta opłaconej, anulowanie nieopłaconej, KSeF tylko odrzuconej i tylko dla admina", () => {
    expect(ids({ type: "invoice", id: "f1", status: "PAID", ksefStatus: "ACCEPTED", userId: "u1" })).toEqual(["pdf", "korekta", "klient", "platnosci"]);
    expect(ids({ type: "invoice", id: "f1", status: "OPEN", ksefStatus: "REJECTED", userId: "u1" })).toEqual(["pdf", "anuluj", "ksef", "klient", "platnosci"]);
    const ksef = akcjeObiektuDlaZapytania({ type: "invoice", id: "f1", status: "PAID", ksefStatus: "REJECTED" }, "ksef", { isAdmin: false, permissions: ["BILLING_VIEW"] });
    expect(ksef[0]).toMatchObject({ id: "ksef", href: "/invoices/f1#ksef", zablokowane: "Wymaga roli administratora" });
  });

  it("inne typy (zgłoszenie, migracja) — bez trybu działań", () => {
    expect(ids({ type: "ticket", id: "t1" })).toEqual([]);
  });
});
