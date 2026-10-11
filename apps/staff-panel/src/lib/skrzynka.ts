/**
 * F2.5 — skrzynka obsługi: z parametrów strony (widok + filtry z formularza) budujemy zapytanie do API i linki
 * stronicowania. Filtry liczy API; panel tylko przekazuje to, co operator wybrał.
 */
export const WIDOKI = {
  wszystkie: { tytul: "Skrzynka zgłoszeń", opis: "Otwarte: najpierw po terminie, potem według terminu rozwiązania." },
  moje: { tytul: "Moje zgłoszenia", opis: "Przypisane do Ciebie i jeszcze otwarte." },
  czeka: { tytul: "Czeka na klienta", opis: "Odpisaliśmy — przypomnienie po 2 dniach, zamknięcie po 5." },
} as const;
export type Widok = keyof typeof WIDOKI;

/** Pola formularza filtrów (nazwy = parametry API). */
export const FILTRY = ["q", "priorytet", "przypisany", "temat", "tag", "sla", "dzial", "userId"] as const;
export type ParametrySkrzynki = Partial<Record<(typeof FILTRY)[number] | "widok" | "page", string>>;

export function widokZ(w: string | undefined): Widok {
  return w === "moje" || w === "czeka" ? w : "wszystkie";
}

/** Zapytanie do API dla widoku i filtrów; filtr „przypisany” z formularza nadpisuje „moje” tylko gdy podany. */
export function zapytanieSkrzynki(p: ParametrySkrzynki): Record<string, string> {
  const widok = widokZ(p.widok);
  const q: Record<string, string> = { stan: widok === "czeka" ? "WAITING_CUSTOMER" : "otwarte", sort: "termin", limit: "50" };
  if (widok === "moje") q.przypisany = "ja";
  for (const k of FILTRY) {
    const v = p[k]?.trim();
    if (v) q[k] = v;
  }
  const strona = Number.parseInt(p.page ?? "", 10);
  if (Number.isFinite(strona) && strona > 1) q.page = String(strona);
  return q;
}

/** Link do tej samej skrzynki z inną stroną (pozostałe parametry bez zmian). */
export function linkStrony(p: ParametrySkrzynki, strona: number, sciezka = "/"): string {
  const qs = new URLSearchParams(
    Object.entries({ ...p, page: strona > 1 ? String(strona) : "" }).filter((e): e is [string, string] => !!e[1]?.trim()),
  ).toString();
  return qs ? `${sciezka}?${qs}` : sciezka;
}

/** F3.7 — działy (widoki skrzynki działu; pole `department` zgłoszenia). */
export const DZIALY: { kod: string; nazwa: string }[] = [
  { kod: "TECHNICAL", nazwa: "Techniczny" },
  { kod: "BILLING", nazwa: "Płatności" },
  { kod: "SALES", nazwa: "Sprzedaż" },
];

export function czyFiltry(p: ParametrySkrzynki): boolean {
  return FILTRY.some((k) => k !== "userId" && !!p[k]?.trim());
}
