/**
 * Pozycja 12 — menu panelu obsługi filtrowane uprawnieniami z `/staff/me/access`. `perm` to uprawnienie,
 * którego wymaga API pod daną stroną (bez niego strona pokazuje tylko komunikat 403). Brak `perm` = strona
 * dostępna dla każdego operatora. Fail-closed: przy nieodczytanym dostępie (`nieOdczytano`) operator nie
 * ma żadnych uprawnień, więc widzi tylko pozycje bez `perm`.
 */
export interface DostepMenu {
  isAdmin: boolean;
  permissions: string[];
  nieOdczytano?: true;
}

export interface LicznikiMenu {
  skrzynka: number;
  moje: number;
  czeka: number;
  poTerminie: number;
}

export type Pozycja = { name: string; href: string; perm?: string; licznik?: number; ostrzezenie?: boolean };
export type Grupa = { naglowek: string; pozycje: Pozycja[] };

export function wolno(dostep: DostepMenu, perm?: string): boolean {
  if (!perm) return true;
  if (dostep.nieOdczytano) return false;
  return dostep.isAdmin || dostep.permissions.includes(perm);
}

export function grupyMenu(liczniki: LicznikiMenu | null, dostep: DostepMenu): Grupa[] {
  const grupy: Grupa[] = [
    {
      naglowek: "Zgłoszenia",
      pozycje: [
        { name: "Skrzynka", href: "/", perm: "TICKETS_VIEW", licznik: liczniki?.skrzynka, ostrzezenie: (liczniki?.poTerminie ?? 0) > 0 },
        { name: "Moje", href: "/?widok=moje", perm: "TICKETS_VIEW", licznik: liczniki?.moje },
        { name: "Czeka na klienta", href: "/?widok=czeka", perm: "TICKETS_VIEW", licznik: liczniki?.czeka },
        { name: "Zamknięte", href: "/tickets/closed", perm: "TICKETS_VIEW" },
      ],
    },
    {
      naglowek: "Klienci",
      pozycje: [
        { name: "Klienci", href: "/crm", perm: "CUSTOMERS_VIEW" },
        { name: "Migracje", href: "/migrations", perm: "MIGRATIONS_MANAGE" },
        { name: "Nadużycia", href: "/abuse", perm: "ABUSE_MANAGE" },
        { name: "Program partnerski", href: "/referral-enrollments", perm: "PROMO_MANAGE" },
        // Wniosek o operację składa każdy operator (API: klasa ADMIN+STAFF bez @StaffPerm).
        { name: "Wnioski", href: "/wnioski" },
      ],
    },
    {
      naglowek: "Wiedza",
      pozycje: [
        { name: "Baza odpowiedzi", href: "/knowledge/odpowiedzi", perm: "TICKETS_VIEW" },
        // Odczyt bazy wiedzy: każdy STAFF (kb.admin.controller GET bez @StaffPerm).
        { name: "Baza wiedzy", href: "/knowledge" },
        { name: "Ustawienia", href: "/settings" },
      ],
    },
  ];
  return grupy
    .map((g) => ({ ...g, pozycje: g.pozycje.filter((p) => wolno(dostep, p.perm)) }))
    .filter((g) => g.pozycje.length > 0);
}
