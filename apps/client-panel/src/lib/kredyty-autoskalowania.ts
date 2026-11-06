import { dataPl } from './data-pl';
import { plForm } from './pl';

/**
 * Decyzja Dominika 6.11.2026 — zamiast rabatu na start: darmowe kredyty na autoskalowanie przy pierwszym zakupie
 * hostingu (kwoty z ustawień oferty, domyślnie 60 zł przy planie rocznym i 10 zł przy miesięcznym). Wydawane tylko
 * na dopłaty za dodatkową moc, ważne 12 miesięcy od przyznania, bez faktury i bez zwrotu
 * (apps/api/src/autoscaling/kredyty-autoskalowania.ts). Kwoty to wartość brutto (jak portfel: 1 K = 1 zł) —
 * pokrywają dopłaty za autoskalowanie liczone w cenach brutto.
 */

/** Pula klienta z API (GET /billing/wallet, GET /subscriptions/:id/autoscaling/history). */
export interface PulaKredytowDto {
  saldo: string;
  kwota: string;
  przyznanoAt: string;
  wygasaAt: string;
  wygasla: boolean;
}

/** „60 zł”, „10 zł”, „12,50 zł”. */
export function zlKredytu(kwota: number): string {
  return Number.isInteger(kwota) ? `${kwota} zł` : `${kwota.toFixed(2).replace('.', ',')} zł`;
}

/** „12 miesięcy”. */
export function okresWaznosci(miesiace = 12): string {
  return `${miesiace} ${plForm(miesiace, 'miesiąc', 'miesiące', 'miesięcy')}`;
}

/** Korzyść w zamówieniu: „+60 zł na autoskalowanie przy pierwszym zakupie (plan roczny), ważne 12 miesięcy.” */
export function korzyscZamowienia(kwota: number, okres: 'MONTH' | 'YEAR', miesiace = 12): string | null {
  if (!(kwota > 0)) return null;
  return `+${zlKredytu(kwota)} na autoskalowanie przy pierwszym zakupie (plan ${okres === 'YEAR' ? 'roczny' : 'miesięczny'}), ważne ${okresWaznosci(miesiace)}.`;
}

/** Zasada w jednym zdaniu (zamówienie, informacje przedumowne, portfel). */
export const ZASADA_KREDYTOW_AUTOSKALOWANIA =
  'Kredyty na autoskalowanie trafiają na konto po opłaceniu zamówienia i opłacają wyłącznie dodatkową moc (najpierw one, potem portfel) – nie pakiet, domeny ani dodatki. Są darmowe: bez faktury i bez zwrotu przy usunięciu konta.';

/** Stan puli do pokazania klientowi; null = nie przyznano. `dostepne` — ile można jeszcze wydać (0 po wygaśnięciu). */
export function opisPuli(
  p: PulaKredytowDto | null | undefined,
): { kwota: string; podpis: string; dostepne: number; wygasla: boolean } | null {
  if (!p) return null;
  const saldo = Number(p.saldo);
  const data = dataPl(p.wygasaAt, { day: 'numeric', month: 'long', year: 'numeric' });
  if (p.wygasla) return { kwota: zlKredytu(0), podpis: `Kredyty na autoskalowanie wygasły ${data}.`, dostepne: 0, wygasla: true };
  if (!(saldo > 0)) {
    return { kwota: zlKredytu(0), podpis: `Kredyty na autoskalowanie wykorzystane (ważność do ${data}).`, dostepne: 0, wygasla: false };
  }
  return { kwota: zlKredytu(saldo), podpis: `Do wykorzystania na autoskalowanie do ${data}.`, dostepne: saldo, wygasla: false };
}
