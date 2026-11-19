import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Kreator marki (paczka 131) – publiczne pliki marki bez logowania pod nieodgadywalnym adresem:
 * `/kreator-marki/p/<token>/<plik>` (logo do stopki e-mail, favicon PNG i obraz OG dla strony z Kreatora stron).
 * Token = id marki (uuid bez myślników, 32 hex) + HMAC-SHA256 (32 hex = 128 bitów) kluczem pochodnym od appKmsKey
 * z własnym prefiksem (wzorzec: kreator/zasoby-token.ts). Bez terminu – adres trafia do stopek wysłanych maili;
 * usunięcie marki = 404. Treść zmienia się razem z marką (bez wersji w adresie).
 */
const RE = /^([0-9a-f]{32})([0-9a-f]{32})$/;
const PREFIKS = 'kreator-marki-plik';

const podpis = (klucz: string, id: string) => createHmac('sha256', `${PREFIKS}|${klucz}`).update(id).digest('hex').slice(0, 32);

export function utworzTokenMarki(klucz: string, markaId: string): string {
  const id = markaId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Nieprawidłowy identyfikator marki.');
  return `${id}${podpis(klucz, id)}`;
}

/** Id marki z tokenu albo null (zły format, zły podpis). */
export function sprawdzTokenMarki(klucz: string, token: string): string | null {
  const m = RE.exec(String(token ?? ''));
  if (!m) return null;
  const [, id, sig] = m;
  const oczekiwany = podpis(klucz, id!);
  if (oczekiwany.length !== sig!.length || !timingSafeEqual(Buffer.from(oczekiwany), Buffer.from(sig!))) return null;
  return `${id!.slice(0, 8)}-${id!.slice(8, 12)}-${id!.slice(12, 16)}-${id!.slice(16, 20)}-${id!.slice(20)}`;
}

/** Pliki dostępne publicznie (lista zamknięta). */
export const PLIKI_PUBLICZNE = ['logo-stopka.png', 'favicon.png', 'og.png'] as const;
export type PlikPubliczny = (typeof PLIKI_PUBLICZNE)[number];
