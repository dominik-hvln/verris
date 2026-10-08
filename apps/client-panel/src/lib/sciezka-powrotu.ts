/**
 * Dokąd wrócić po zalogowaniu (`/login?next=…`, PB-45: link z maila do zgody na migrację). Tylko względna
 * ścieżka panelu `/dashboard…` — wszystko inne (pełny adres, `//host`, `\`, `..`, znaki sterujące) daje
 * `/dashboard`, żeby `next` nie dało się użyć jako przekierowania na obcą stronę.
 */
export const DOMYSLNY_POWROT = "/dashboard";

export function sciezkaPowrotu(next: unknown): string {
  if (typeof next !== "string" || next.length > 2048) return DOMYSLNY_POWROT;
  if (!/^\/dashboard(?:[/?#]|$)/.test(next)) return DOMYSLNY_POWROT;
  if (/[\\\u0000-\u001f\u007f]/.test(next) || next.includes("//")) return DOMYSLNY_POWROT;
  const sciezka = next.split(/[?#]/, 1)[0]!;
  if (/(^|\/)\.\.?(\/|$)/.test(sciezka) || /%2e|%2f|%5c/i.test(sciezka)) return DOMYSLNY_POWROT;
  return next;
}
