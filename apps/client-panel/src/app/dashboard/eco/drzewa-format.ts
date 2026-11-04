/**
 * W6 (decyzja 12) — formatowanie udziału w drzewach. Część = 1/10 000 drzewa (setna procenta), jak w API.
 * Ułamki obcinamy (nie zaokrąglamy w górę) — nie pokazujemy więcej, niż jest.
 */
import { plForm } from '@/lib/pl';

export const CZESCI_DRZEWA = 10_000;

/** „7,00%” */
export function procentDrzewa(czesci: number): string {
  const c = Math.max(0, Math.floor(czesci));
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}%`;
}

/** „3” albo „1,07” (drzewa z dokładnością do setnych). */
export function liczbaDrzew(czesci: number): string {
  const setne = Math.floor(Math.max(0, czesci) / 100);
  const reszta = setne % 100;
  return reszta === 0 ? String(setne / 100) : `${Math.floor(setne / 100)},${String(reszta).padStart(2, '0')}`;
}

/** „3 drzewa”, „1 drzewo”, „1,07 drzewa” (ułamek → dopełniacz l.poj.). */
export function drzewaSlownie(czesci: number): string {
  const setne = Math.floor(Math.max(0, czesci) / 100);
  if (setne % 100 !== 0) return `${liczbaDrzew(czesci)} drzewa`;
  const n = setne / 100;
  return `${n} ${plForm(n, 'drzewo', 'drzewa', 'drzew')}`;
}

/** Punkty za procent drzewa — tak samo jak API (w górę do pełnego punktu). */
export function punktyZaProcent(procent: number, punktyNaDrzewo: number): number {
  return Math.ceil((procent * punktyNaDrzewo) / 100);
}
