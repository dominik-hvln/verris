/**
 * Escapowanie tekstu z modelu strony. Każdy tekst z modelu (AI, klient) przechodzi przez `esc()` –
 * także w atrybutach (escapuje cudzysłowy obu rodzajów), więc jedna funkcja wystarcza wszędzie.
 */
const MAPA: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(tekst: string | number | null | undefined): string {
  if (tekst === null || tekst === undefined) return '';
  return String(tekst).replace(/[&<>"']/g, (z) => MAPA[z] ?? z);
}

/**
 * JSON do `<script type="application/ld+json">`: zamienia znaki, które mogłyby zamknąć skrypt
 * albo zmienić jego interpretację (`<`, `>`, `&`, U+2028, U+2029), na sekwencje \uXXXX.
 * Wynik dalej jest poprawnym JSON-em (JSON.parse zwraca te same dane).
 */
export function jsonBezpieczny(dane: unknown): string {
  return JSON.stringify(dane)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Tekst do XML (sitemap). */
export const escXml = esc;
