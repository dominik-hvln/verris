import type { KlientPrismy } from './faktura-za-portfel';

/**
 * FAK-01 — kto wystawia fakturę VAT: panel czy program księgowy.
 *
 * Decyzja: docs/architektura/ADR-2026-09-22-faktury-w-programie-ksiegowym.md.
 *
 * DLACZEGO W OGÓLE PRZEŁĄCZNIK
 * ────────────────────────────
 * Na start faktury VAT wystawia operator w programie księgowym. Panel dalej
 * liczy pieniądze i zakłada wiersz dokumentu atomowo z obciążeniem portfela
 * (Z-01 zostaje nietknięte), ale ten wiersz NIE MOŻE nosić numeru z serii
 * faktur VAT. Dwie numeracje faktur tego samego podatnika — jedna w panelu,
 * druga w programie — to dwie ciągłe serie, z których jedna ma luki za każdym
 * razem, gdy druga wystawi dokument (art. 106e ust. 1 pkt 2 ustawy o VAT).
 *
 * Dlatego w trybie `zewnetrzny` panel nadaje numer z WŁASNEJ serii `VDR`
 * (dokument rozliczeniowy), klient widzi „dokument rozliczeniowy", a numer
 * faktury z programu księgowego operator dopisuje później. Tryb `panel`
 * przywraca dotychczasowe zachowanie (VFV/VFK, KSeF z panelu) — gotowe na
 * dzień, w którym zintegrujemy program księgowy po API albo wrócimy do
 * wystawiania z panelu.
 *
 * DLACZEGO DOMYŚLNIE `zewnetrzny`
 * ───────────────────────────────
 * Fail-safe w stronę, która nie tworzy dokumentów podatkowych. Literówka w
 * ustawieniu, brak wiersza w bazie albo nieznana wartość dają dokument
 * rozliczeniowy — czyli co najwyżej brak faktury do dopisania ręcznie, a nie
 * faktura VAT z panelu wystawiona obok faktury z programu księgowego.
 */

export const KLUCZ_TRYBU_FAKTUROWANIA = 'faktury.tryb';

export type TrybFakturowania = 'panel' | 'zewnetrzny';
export const TRYB_DOMYSLNY: TrybFakturowania = 'zewnetrzny';

export const RODZAJ_FAKTURA_VAT = 'FAKTURA_VAT';
export const RODZAJ_DOKUMENT_ROZLICZENIOWY = 'DOKUMENT_ROZLICZENIOWY';
/** M-24 — proforma przed odnowieniem: tylko PDF na żądanie, nie zapisywana, bez serii VAT. */
export const RODZAJ_PROFORMA = 'PROFORMA';
export type RodzajPrawny = typeof RODZAJ_FAKTURA_VAT | typeof RODZAJ_DOKUMENT_ROZLICZENIOWY;

/** Seria dokumentu rozliczeniowego i jego korekty — rozłączne z VFV/VFK. */
export const SERIA_DOKUMENTU = 'VDR';
export const SERIA_KOREKTY_DOKUMENTU = 'VDK';

/**
 * Wszystko poza dokładnym 'panel' to tryb zewnętrzny — także 'Panel' i
 * ' panel'. Wystawianie faktur VAT z panelu włącza się świadomie, jednym
 * dokładnym słowem; pobłażliwe parsowanie działałoby w złą stronę.
 */
export function normalizujTryb(surowy: string | null | undefined): TrybFakturowania {
  return surowy === 'panel' ? 'panel' : TRYB_DOMYSLNY;
}

export function rodzajPrawnyDla(tryb: TrybFakturowania): RodzajPrawny {
  return tryb === 'panel' ? RODZAJ_FAKTURA_VAT : RODZAJ_DOKUMENT_ROZLICZENIOWY;
}

export function seriaDokumentu(
  tryb: TrybFakturowania,
  korekta: boolean,
  serieVat: { faktura: string; korekta: string },
): string {
  if (tryb === 'panel') return korekta ? serieVat.korekta : serieVat.faktura;
  return korekta ? SERIA_KOREKTY_DOKUMENTU : SERIA_DOKUMENTU;
}

/**
 * KSeF z panelu ma sens wyłącznie wtedy, gdy panel wystawia faktury VAT.
 * Dokument rozliczeniowy wysłany do KSeF-u stałby się fakturą — dokładnie tym
 * dublem, przed którym chroni cały ten plik.
 */
export function ksefDozwolony(tryb: TrybFakturowania, wlaczonyWUstawieniach: boolean): boolean {
  return tryb === 'panel' && wlaczonyWUstawieniach;
}

/** Czy dokument o tym rodzaju może trafić do KSeF-u. */
export function rodzajKwalifikujeDoKsef(rodzaj: string | null | undefined): boolean {
  return rodzaj === RODZAJ_FAKTURA_VAT;
}

/** Czy numer należy do którejkolwiek serii nadawanej przez panel. */
export function toNumerPanelu(numer: string, serie: readonly string[]): boolean {
  return serie.some((s) => numer.startsWith(`${s}/`));
}

/**
 * Odczyt trybu W TEJ SAMEJ transakcji, w której nadawany jest numer.
 *
 * Nie przez cache `PlatformSettingsService` — przełączenie trybu ma działać
 * od następnego dokumentu, a nie po wygaśnięciu cache'u, bo w oknie
 * rozjazdu powstawałyby dokumenty z serii, której już nie powinno być.
 */
export async function odczytajTrybFakturowania(db: KlientPrismy): Promise<TrybFakturowania> {
  const wiersze = await db.$queryRaw<Array<{ value: string }>>`
    SELECT "value" FROM "platform_settings" WHERE "key" = ${KLUCZ_TRYBU_FAKTUROWANIA} LIMIT 1
  `;
  return normalizujTryb(wiersze[0]?.value);
}

/**
 * M-34 — KIEDY powstaje dokument za pieniądze z portfela (decyzja 2026-09-23):
 *   · `przy_doladowaniu` — przy realnej wpłacie (doładowanie); wydawanie K dokumentów nie tworzy,
 *   · `przy_obciazeniu`  — dotychczasowy model Z-01: dokument przy każdym obciążeniu.
 * Nieznana wartość = domyślny model z decyzji.
 */
export const KLUCZ_MODELU_FAKTUROWANIA = 'faktury.model';
export type ModelFakturowania = 'przy_doladowaniu' | 'przy_obciazeniu';
export const MODEL_DOMYSLNY: ModelFakturowania = 'przy_doladowaniu';

export function normalizujModel(v: string | null | undefined): ModelFakturowania {
  return v === 'przy_obciazeniu' ? 'przy_obciazeniu' : MODEL_DOMYSLNY;
}

export async function odczytajModelFakturowania(db: KlientPrismy): Promise<ModelFakturowania> {
  const w = await db.$queryRaw<Array<{ value: string }>>`
    SELECT "value" FROM "platform_settings" WHERE "key" = ${KLUCZ_MODELU_FAKTUROWANIA} LIMIT 1
  `;
  return normalizujModel(w[0]?.value);
}
