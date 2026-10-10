import { grupyMenu } from "./menu-obslugi";

const nazwy = (d: Parameters<typeof grupyMenu>[1]) => grupyMenu(null, d).flatMap((g) => g.pozycje.map((p) => p.name));
const L1 = ["DASHBOARD_VIEW", "CUSTOMERS_VIEW", "TICKETS_VIEW", "TICKETS_MANAGE", "BILLING_VIEW"];

describe("menu obsługi według uprawnień (pozycja 12)", () => {
  it("L1 nie widzi migracji, nadużyć ani programu partnerskiego", () => {
    const m = nazwy({ isAdmin: false, permissions: L1 });
    expect(m).toEqual(expect.arrayContaining(["Skrzynka", "Moje", "Klienci", "Wnioski", "Baza odpowiedzi", "Baza wiedzy", "Ustawienia"]));
    expect(m).not.toEqual(expect.arrayContaining(["Migracje"]));
    expect(m).not.toContain("Nadużycia");
    expect(m).not.toContain("Program partnerski");
  });

  it("administrator widzi wszystko", () => {
    expect(nazwy({ isAdmin: true, permissions: [] })).toHaveLength(12);
  });

  it("uprawnienie odsłania swoją pozycję (MIGRATIONS_MANAGE → Migracje)", () => {
    expect(nazwy({ isAdmin: false, permissions: [...L1, "MIGRATIONS_MANAGE"] })).toContain("Migracje");
  });

  it("fail-closed: dostęp nieodczytany — tylko pozycje bez uprawnień, także dla „admina” z błędu", () => {
    const m = nazwy({ isAdmin: true, permissions: ["TICKETS_VIEW"], nieOdczytano: true });
    expect(m).toEqual(["Wnioski", "Baza wiedzy", "Ustawienia"]);
  });

  it("puste grupy znikają (Marketing bez zgłoszeń i klientów)", () => {
    const g = grupyMenu(null, { isAdmin: false, permissions: ["DASHBOARD_VIEW", "PROMO_MANAGE"] });
    expect(g.map((x) => x.naglowek)).toEqual(["Klienci", "Wiedza"]);
  });
});
