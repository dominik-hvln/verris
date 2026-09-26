import { Prisma } from '@verris/database';
import type { KlientPrismy } from './faktura-za-portfel.js';
import type { KursNbp } from './kurs-nbp.js';
import type { WynikVies } from './vies.service.js';

/**
 * M-09 — jak opodatkować usługę Verris dla konkretnego nabywcy.
 *
 * Hosting to usługa elektroniczna (rozporządzenie 282/2011, zał. I). Reguły
 * (decyzja 2026-09-23, docs/VERRIS.md „VAT, waluty i doładowania”):
 *
 *   · Polska                                  → 23%
 *   · UE, firma z numerem VAT-UE ważnym w VIES → „np”, odwrotne obciążenie (art. 28b)
 *   · UE, konsument (albo numer nieważny)      → 23%, dopóki sprzedaż takich usług
 *     konsumentom z innych krajów UE < 42 000 zł w roku bieżącym i poprzednim
 *     (art. 28k); po przekroczeniu stawka kraju klienta przez OSS — ale TYLKO gdy
 *     operator zarejestrował się w OSS i włączył to w ustawieniach. Bez tego
 *     zostaje 23% z flagą `wymagaOss`, żeby alarm krzyczał, a panel nie wystawiał
 *     dokumentu ze stawką obcego kraju bez rejestracji.
 *   · spoza UE                                → „np”, miejsce świadczenia poza krajem
 *
 * Nie 0%: stawka 0% dotyczy towarów (WDT, eksport). Dokument z „0%” zamiast „np”
 * przy usłudze to błąd w JPK.
 */

/** Stawki standardowe VAT w UE (stan 2026-09). Zmiana stawki w którymś kraju = zmiana tutaj. */
export const STAWKI_UE: Readonly<Record<string, number>> = {
  AT: 20, BE: 21, BG: 20, HR: 25, CY: 19, CZ: 21, DK: 25, EE: 24, FI: 25.5,
  FR: 20, DE: 19, GR: 24, HU: 27, IE: 23, IT: 22, LV: 21, LT: 21, LU: 17,
  MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SK: 23, SI: 22, ES: 21, SE: 25,
};

export const STAWKA_PL = 23;
/** Art. 28k ust. 1 pkt 3 — próg sprzedaży usług elektronicznych konsumentom z UE. */
export const PROG_OSS_PLN = 42_000;
/** Od tylu procent progu alarmujemy operatora. */
export const ALARM_OSS_PROCENT = 80;

export const ADNOTACJA_OO = 'odwrotne obciążenie';
export const ADNOTACJA_POZA_UE =
  'Miejsce świadczenia usługi poza terytorium kraju — usługa nie podlega opodatkowaniu VAT w Polsce.';

export type KodVat = 'PL' | 'UE_B2C' | 'OO' | 'OSS' | 'POZA_UE';

export interface TraktowanieVat {
  kod: KodVat;
  /** Stawka w %, albo null = „np” (nie podlega). */
  stawka: number | null;
  /** Kraj, w którym jest miejsce opodatkowania (ISO-3166 alfa-2). */
  kraj: string;
  adnotacja: string | null;
  /**
   * Klient płaci cenę NETTO (bez polskiego VAT): przy doładowaniu 1 zł = 1,23 K.
   * Decyzja 2026-09-23 — dotyczy klientów, od których nie pobieramy polskiego VAT.
   */
  cenaNetto: boolean;
  /** Sprzedaż konsumentom z UE przekroczyła próg, a OSS nie jest włączony — alarm. */
  wymagaOss: boolean;
  /** Liczy się do progu 42 000 zł (konsument z innego kraju UE). */
  b2cUe: boolean;
}

export interface NabywcaVat {
  /** Kraj z profilu klienta; pusty = PL. */
  kraj: string | null | undefined;
  /** Wynik VIES dla numeru VAT-UE: true/false, null = brak numeru albo VIES niedostępny. */
  viesWazny: boolean | null;
  /** Sprzedaż konsumentom z UE w PLN: większa z (rok bieżący, rok poprzedni). */
  sprzedazB2cUePln: number;
  ossWlaczone: boolean;
}

export function normalizujKraj(kraj: string | null | undefined): string {
  const k = (kraj ?? '').trim().toUpperCase();
  if (k === 'EL') return 'GR';
  return /^[A-Z]{2}$/.test(k) ? k : 'PL';
}

export function ustalTraktowanieVat(n: NabywcaVat): TraktowanieVat {
  const kraj = normalizujKraj(n.kraj);
  const baza = { kraj, adnotacja: null, cenaNetto: false, wymagaOss: false, b2cUe: false };
  if (kraj === 'PL') return { ...baza, kod: 'PL', stawka: STAWKA_PL };
  if (!(kraj in STAWKI_UE)) {
    return { ...baza, kod: 'POZA_UE', stawka: null, adnotacja: ADNOTACJA_POZA_UE, cenaNetto: true };
  }
  if (n.viesWazny === true) {
    return { ...baza, kod: 'OO', stawka: null, adnotacja: ADNOTACJA_OO, cenaNetto: true };
  }
  if (n.ossWlaczone) {
    return { ...baza, kod: 'OSS', stawka: STAWKI_UE[kraj], b2cUe: true };
  }
  return {
    ...baza,
    kod: 'UE_B2C',
    stawka: STAWKA_PL,
    b2cUe: true,
    wymagaOss: n.sprzedazB2cUePln >= PROG_OSS_PLN,
  };
}

/**
 * Odtworzenie traktowania z kodu zapisanego w metadanych płatności (Stripe) —
 * stawka ustalona przy tworzeniu płatności obowiązuje przy jej zaksięgowaniu,
 * nawet gdy między nimi zmienił się próg OSS albo odpowiedź VIES.
 */
export function traktowanieZKodu(kod: string, stawka: number | null, kraj: string): TraktowanieVat | null {
  const k = normalizujKraj(kraj);
  const baza = { kraj: k, adnotacja: null, cenaNetto: false, wymagaOss: false, b2cUe: false };
  switch (kod) {
    case 'PL': return { ...baza, kod: 'PL', stawka: STAWKA_PL };
    case 'OO': return { ...baza, kod: 'OO', stawka: null, adnotacja: ADNOTACJA_OO, cenaNetto: true };
    case 'POZA_UE': return { ...baza, kod: 'POZA_UE', stawka: null, adnotacja: ADNOTACJA_POZA_UE, cenaNetto: true };
    case 'UE_B2C': return { ...baza, kod: 'UE_B2C', stawka: STAWKA_PL, b2cUe: true };
    case 'OSS':
      return typeof stawka === 'number' && stawka > 0 ? { ...baza, kod: 'OSS', stawka, b2cUe: true } : null;
    default: return null;
  }
}

/** Etykieta stawki na dokumencie: „23%”, „25,5%”, „np”. */
export function etykietaStawki(stawka: number | null): string {
  return stawka === null ? 'np' : `${String(stawka).replace('.', ',')}%`;
}

/** Rozbicie kwoty brutto wg traktowania: przy „np” całość jest netto, VAT 0. */
export function rozbicieWgStawki(
  brutto: Prisma.Decimal,
  stawka: number | null,
): { netto: Prisma.Decimal; vat: Prisma.Decimal; brutto: Prisma.Decimal } {
  const b = brutto.toDecimalPlaces(2);
  if (stawka === null) return { netto: b, vat: new Prisma.Decimal(0), brutto: b };
  const netto = b.mul(100).dividedBy(new Prisma.Decimal(100).plus(stawka)).toDecimalPlaces(2);
  return { netto, vat: b.minus(netto), brutto: b };
}

/** Ile K dostaje klient za wpłatę `kwotaPln` — przy cenie netto ×(1 + 23%). */
export function kredytZaWplate(kwotaPln: Prisma.Decimal, t: Pick<TraktowanieVat, 'cenaNetto'>): Prisma.Decimal {
  const k = t.cenaNetto ? kwotaPln.mul(100 + STAWKA_PL).dividedBy(100) : kwotaPln;
  return k.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Numer VAT-UE z pola NIP profilu: bez spacji i myślników, bez prefiksu kraju.
 * Grecja ma w VIES kod „EL”, nie „GR”. Zwraca null, gdy numeru nie ma albo
 * ma znaki, których VIES nie przyjmie.
 */
export function numerVatUe(kraj: string, nip: string | null | undefined): { kodVies: string; numer: string } | null {
  const kodVies = kraj === 'GR' ? 'EL' : kraj;
  let n = (nip ?? '').toUpperCase().replace(/[\s.-]/g, '');
  if (n.startsWith(kodVies)) n = n.slice(2);
  return /^[0-9A-Z+*]{2,12}$/.test(n) ? { kodVies, numer: n } : null;
}

/**
 * Zapisywane w `Invoice.buyerSnapshot.vat` przy powstaniu dokumentu — dowód, na
 * jakiej podstawie przyjęto stawkę (wynik VIES z dnia transakcji, kurs NBP) i
 * źródło sumy do progu OSS. Finalizacja PDF-a zachowuje ten klucz.
 */
export interface VatDokumentu {
  kod: KodVat;
  stawka: number | null;
  kraj: string;
  adnotacja: string | null;
  b2cUe: boolean;
  nettoPln: string;
  vatPln: string;
  kurs: KursNbp | null;
  vies: WynikVies | null;
}

// ─────────────────────────────────────────────────────────────────────────────

export const KLUCZ_OSS = 'vat.ossWlaczone';

export async function odczytajOss(db: KlientPrismy): Promise<boolean> {
  const w = await db.$queryRaw<Array<{ value: string }>>`
    SELECT "value" FROM "platform_settings" WHERE "key" = ${KLUCZ_OSS} LIMIT 1
  `;
  return w[0]?.value === '1' || w[0]?.value === 'true';
}

/**
 * Sprzedaż konsumentom z innych krajów UE (netto w PLN) — rok bieżący i poprzedni.
 * Źródło: `buyerSnapshot.vat` zapisywany przy każdym dokumencie (nettoPln, b2cUe).
 */
export async function sprzedazB2cUe(db: KlientPrismy, teraz: Date): Promise<{ biezacy: number; poprzedni: number }> {
  const rok = teraz.getUTCFullYear();
  const w = await db.$queryRaw<Array<{ rok: number; suma: Prisma.Decimal | null }>>`
    SELECT EXTRACT(YEAR FROM "issuedAt")::int AS rok,
           SUM(("buyerSnapshot"->'vat'->>'nettoPln')::numeric) AS suma
    FROM "Invoice"
    WHERE "status" <> 'VOID'
      AND "buyerSnapshot"->'vat'->>'b2cUe' = 'true'
      AND "issuedAt" >= make_date(${rok - 1}::int, 1, 1)
    GROUP BY 1
  `;
  const dla = (r: number) => Number(w.find((x) => x.rok === r)?.suma ?? 0);
  return { biezacy: dla(rok), poprzedni: dla(rok - 1) };
}
