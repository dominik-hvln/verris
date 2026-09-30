import { plForm } from './pl';

/** Liczba dni w dopełniaczu po „z” / „przez”: „z 1 dnia”, „z 30 dni”. */
export const zDni = (n: number) => `${n} ${plForm(n, 'dnia', 'dni', 'dni')}`;

/**
 * H-03 — opcje retencji kopii poza serwerem do wyboru w planie: minimum w cenie, typowe progi i sufit planu.
 * Zakres przychodzi z API (min = KOPIE_OFFSITE_DNI, max = sufit planu), więc panel nie zna limitów sam.
 */
export function opcjeRetencji(min: number, max: number, biezaca?: number): number[] {
  const progi = [min, 45, 60, 90, max, ...(biezaca !== undefined ? [biezaca] : [])];
  return [...new Set(progi.filter((d) => d >= min && d <= max))].sort((a, b) => a - b);
}
