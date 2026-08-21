/**
 * Polska odmiana liczebników (formy: pojedyncza / mnoga „few" 2–4 / mnoga „many").
 * Reguła: 1 → one; końcówka 2–4 (poza 12–14) → few; reszta → many.
 */
export function plForm(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count);
  const n10 = n % 10;
  const n100 = n % 100;
  if (n === 1) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

/** Zwraca „<liczba> <odmienione słowo>", np. plural(1,'węzeł','węzły','węzłów') → „1 węzeł". */
export function plural(count: number, one: string, few: string, many: string): string {
  return `${count} ${plForm(count, one, few, many)}`;
}

// Gotowe etykiety najczęstszych rzeczowników w panelu.
export const nodes = (n: number) => plural(n, "węzeł", "węzły", "węzłów");
export const accounts = (n: number) => plural(n, "konto", "konta", "kont");
export const services = (n: number) => plural(n, "usługa", "usługi", "usług");
export const clients = (n: number) => plural(n, "klient", "klienci", "klientów");
export const tickets = (n: number) => plural(n, "zgłoszenie", "zgłoszenia", "zgłoszeń");
export const days = (n: number) => plural(n, "dzień", "dni", "dni");
