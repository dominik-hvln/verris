import { AsyncLocalStorage } from 'node:async_hooks';

/** Kontekst żądania dla dziennika audytu (impersonacja, subkonto) — patrz kontekst-zadania.ts. */
export const kontekstZadania = new AsyncLocalStorage<{
  impersonatedBy?: string;
  subkonto?: { wlasciciel: string; osoba: string };
  /** PB-48 — operacja wykonywana z akceptacji wniosku: każdy wpis dziennika dostaje wniosekId i wnioskującego. */
  wniosek?: { wniosekId: string; wnioskujacyUserId: string };
  /**
   * F2.2 — akcja operatora na koncie klienta (pasek akcji karty usługi, bez impersonacji). Serwisy hostingu
   * wołane z id właściciela zapisują „zrobił właściciel” — dziennik wpisuje operatora i numer zgłoszenia,
   * więc klient widzi w aktywności „obsługa Verris (zgłoszenie #…)”, a nie siebie.
   */
  operator?: { wlasciciel: string; operatorUserId: string; zgloszenieId: string | null };
}>();
