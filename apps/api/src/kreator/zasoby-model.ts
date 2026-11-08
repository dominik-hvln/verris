import { BadRequestException } from '@nestjs/common';
import type { Strona } from '@verris/kreator';

/**
 * Paczka 122 – zdjęcia z biblioteki w modelu strony (Obraz.zasobId). Czyste funkcje: zebranie identyfikatorów,
 * uzupełnienie wymiarów z bazy (renderer liczy z nich szerokości wariantów – model nie może tu kłamać).
 */

type ObrazZZasobem = { zasobId: string; szerokosc?: number; wysokosc?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Obiekty Obraz z `zasobId` w dowolnym miejscu modelu (sekcje, podstrony, SEO). */
export function obrazyZZasobem(model: unknown): ObrazZZasobem[] {
  const wynik: ObrazZZasobem[] = [];
  const odwiedz = (x: unknown, glebokosc: number): void => {
    if (glebokosc > 40 || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      for (const e of x) odwiedz(e, glebokosc + 1);
      return;
    }
    const o = x as Record<string, unknown>;
    if (typeof o.zasobId === 'string' && 'alt' in o) wynik.push(o as unknown as ObrazZZasobem);
    for (const v of Object.values(o)) odwiedz(v, glebokosc + 1);
  };
  odwiedz(model, 0);
  return wynik;
}

/** Unikalne identyfikatory zdjęć z biblioteki użyte w modelu. */
export function idZasobow(model: unknown): string[] {
  return [...new Set(obrazyZZasobem(model).map((o) => o.zasobId.toLowerCase()))];
}

export const BLAD_CUDZEGO_ZASOBU = 'Na stronie jest zdjęcie, którego nie ma w Twojej bibliotece – wybierz zdjęcie ponownie.';

/**
 * Wymiary oryginałów z bazy wpisane do modelu (kopia). Brak któregoś zasobu (cudzy, usunięty) → BadRequest
 * z polskim komunikatem – zapis strony z cudzym zdjęciem jest odrzucany.
 */
export function uzupelnijWymiary<T extends Strona>(strona: T, zasoby: { id: string; szerokosc: number; wysokosc: number }[]): T {
  const mapa = new Map(zasoby.map((z) => [z.id.toLowerCase(), z]));
  const kopia = structuredClone(strona);
  for (const o of obrazyZZasobem(kopia)) {
    const z = mapa.get(o.zasobId.toLowerCase());
    if (!z || !UUID.test(o.zasobId)) throw new BadRequestException(BLAD_CUDZEGO_ZASOBU);
    o.szerokosc = z.szerokosc;
    o.wysokosc = z.wysokosc;
  }
  return kopia;
}
