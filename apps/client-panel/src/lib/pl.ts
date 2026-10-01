/**
 * Polska odmiana liczebników (1 → one; końcówka 2–4 poza 12–14 → few; reszta → many).
 */
export function plForm(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count);
  const n10 = n % 10;
  const n100 = n % 100;
  if (n === 1) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export function plural(count: number, one: string, few: string, many: string): string {
  return `${count} ${plForm(count, one, few, many)}`;
}

export const days = (n: number) => plural(n, "dzień", "dni", "dni");
export const domains = (n: number) => plural(n, "domena", "domeny", "domen");
export const databases = (n: number) => plural(n, "baza", "bazy", "baz");
export const mailboxes = (n: number) => plural(n, "skrzynka", "skrzynki", "skrzynek");
export const files = (n: number) => plural(n, "plik", "pliki", "plików");
export const services = (n: number) => plural(n, "usługa", "usługi", "usług");
export const entries = (n: number) => plural(n, "wpis", "wpisy", "wpisów");
export const years = (n: number) => plural(n, "rok", "lata", "lat");
export const variants = (n: number) => plural(n, "wariant", "warianty", "wariantów");
export const backupForm = (n: number) => plForm(n, "kopia", "kopie", "kopii");
export const mailboxForm = (n: number) => plForm(n, "skrzynka", "skrzynki", "skrzynek");

/** „Pozostał 1 kod zapasowy” / „Pozostały 3 kody zapasowe” / „Pozostało 5 kodów zapasowych” — czasownik też się odmienia. */
export const recoveryCodesLeft = (n: number) => ({
  verb: plForm(n, "Pozostał", "Pozostały", "Pozostało"),
  noun: plForm(n, "kod zapasowy", "kody zapasowe", "kodów zapasowych"),
});
