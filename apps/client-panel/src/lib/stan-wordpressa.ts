/**
 * Weryfikacja 11.10 (prod, konto d3) — „Wszystkie strony WordPress” pokazywały „aktualny” obok „podatności: 7”
 * dla WordPressa 7.1.2 sprawdzonego 6.10 (główna domena miała już 7.1.3). „Aktualny” mówimy tylko, gdy ostatnie
 * sprawdzenie jest świeże (≤ 48 h) i nie znalazło ani aktualizacji, ani podatności; stare dane mówią, ile mają dni.
 */
export const WP_SWIEZE_MS = 48 * 60 * 60 * 1000;

export type StanWp = { tekst: string; ton: 'data' | 'muted' } | null;

export function stanAktualnosciWp(
  s: { rdzen?: string | null; wtyczki?: number | null; motywy?: number | null; podatnosci?: number | null; sprawdzono?: string | null },
  teraz: number = Date.now(),
): StanWp {
  if (s.rdzen || s.wtyczki || s.motywy) return null; // osobne pigułki „rdzeń → …”, „wtyczki: N”
  const wiek = s.sprawdzono ? teraz - new Date(s.sprawdzono).getTime() : Infinity;
  if (wiek > WP_SWIEZE_MS) {
    const dni = Number.isFinite(wiek) ? Math.floor(wiek / 86_400_000) : null;
    return { tekst: dni != null ? `dane sprzed ${dni} ${dni === 1 ? 'dnia' : 'dni'} — sprawdź ponownie` : 'nie sprawdzono', ton: 'muted' };
  }
  if (s.podatnosci) return null; // pigułka „podatności: N” wystarczy
  return { tekst: 'aktualny', ton: 'data' };
}
