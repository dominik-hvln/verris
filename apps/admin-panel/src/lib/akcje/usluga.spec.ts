import { dzialaniaObiektu } from "./rejestr";
import { AKCJE_USLUGI, type UslugaDlaAkcji } from "./usluga";

const ADMIN = { isAdmin: true, permissions: [] };
const operator = (...permissions: string[]) => ({ isAdmin: false, permissions });
const aktywna: UslugaDlaAkcji = { id: "s1", status: "ACTIVE", zakladanieNieudane: false, maKonto: true, klientId: "u1", wezelId: "w1" };
const ids = (u: UslugaDlaAkcji, d = ADMIN) => dzialaniaObiektu(AKCJE_USLUGI, u, d).map((x) => x.id);

/** Plan E, patch 9 — Ponów/Odrzuć zakładanie i zlecenia migracji były tylko w kolejkach, nie na karcie usługi. */
describe("Działania usługi", () => {
  it("nieudane zakładanie: „Ponów albo odrzuć” na Przeglądzie karty; działająca usługa — bez", () => {
    const nieudana = dzialaniaObiektu(AKCJE_USLUGI, { ...aktywna, status: "PROVISIONING", zakladanieNieudane: true }, ADMIN);
    expect(nieudana[0]).toMatchObject({ id: "zakladanie", href: "/subscriptions/s1#zakladanie", zablokowane: null });
    expect(ids(aktywna)).not.toContain("zakladanie");
  });

  it("aktywna usługa: naprawa, operacje, konto, migracje, kopie i powiązania z linkami do miejsc na karcie", () => {
    const lista = dzialaniaObiektu(AKCJE_USLUGI, aktywna, ADMIN);
    const href = (id: string) => lista.find((x) => x.id === id)?.href;
    expect(href("migracje")).toBe("/subscriptions/s1?sekcja=migracje#zlecenia-migracji");
    expect(href("zawieszenie")).toBe("/subscriptions/s1?sekcja=operacje#zawieszenie");
    expect(href("migracja-za-klienta")).toBe("/migrations/za-klienta?subscriptionId=s1");
    expect(href("klient")).toBe("/customers/u1");
    expect(href("wezel")).toBe("/nodes/w1");
    expect(lista.find((x) => x.id === "zawieszenie")?.nazwa).toBe("Zawieś usługę");
    expect(dzialaniaObiektu(AKCJE_USLUGI, { ...aktywna, status: "SUSPENDED" }, ADMIN).find((x) => x.id === "zawieszenie")?.nazwa).toBe("Odwieś usługę");
  });

  it("bez konta hostingowego: bez operacji na koncie i bez węzła", () => {
    const bez = ids({ id: "s1", status: "ACTIVE", zakladanieNieudane: false, maKonto: false, klientId: "u1", wezelId: null });
    for (const id of ["konto-klienta", "odtworzenie", "migracja-za-klienta", "zmiana-planu", "wezel"]) expect(bez).not.toContain(id);
    expect(bez).toContain("klient");
  });

  it("uprawnienia jak w API: STAFF bez PROVISIONING_MANAGE — wyszarzone; diagnostyka — którekolwiek z trzech", () => {
    const op = operator("SUBSCRIPTIONS_MANAGE");
    const lista = dzialaniaObiektu(AKCJE_USLUGI, { ...aktywna, status: "PROVISIONING", zakladanieNieudane: true }, op);
    const po = (id: string) => lista.find((x) => x.id === id)!;
    expect(po("zakladanie").zablokowane).toBe("Wymaga PROVISIONING_MANAGE");
    expect(po("zawieszenie").zablokowane).toBe("Wymaga roli administratora");
    expect(po("diagnostyka").zablokowane).toBeNull();
    expect(dzialaniaObiektu(AKCJE_USLUGI, aktywna, operator("NODES_VIEW")).find((x) => x.id === "diagnostyka")?.zablokowane).toBe(
      "Wymaga SUBSCRIPTIONS_MANAGE lub ACCOUNT_DIAGNOSTICS_VIEW lub TICKETS_MANAGE",
    );
  });

  it("Cmd+K bez pełnego stanu (sam status z wyszukiwarki): pokazuje to, czego nie da się wykluczyć", () => {
    const zPalety = ids({ id: "s1", status: "PROVISIONING", klientId: "u1" });
    expect(zPalety).toContain("zakladanie");
    expect(zPalety).toContain("odtworzenie");
    expect(zPalety).not.toContain("wezel");
  });

  // Przegląd 10.10: na karcie sekcji #zakonczenie nie ma, gdy usługa jest zakończona, a konto już usunięte.
  it("zakończona usługa z usuniętym kontem — bez „Zakończ i usuń konto” (kotwicy nie ma na karcie)", () => {
    expect(ids({ ...aktywna, status: "CANCELED", kontoUsuniete: true })).not.toContain("zakonczenie");
    expect(ids({ ...aktywna, status: "CANCELED", kontoUsuniete: false })).toContain("zakonczenie");
  });
});
