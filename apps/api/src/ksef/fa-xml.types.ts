import { Invoice } from '@verris/database';

/**
 * Wspólne typy i walidatory generatora e-Faktur FA(3).
 *
 * Zgodność z regułami weryfikacji KSeF 2.0 (ksef-docs, stan: lipiec 2026):
 *  - api-changelog 2.0.1: na PRD walidowana jest suma kontrolna NIP
 *    (Podmiot1/Podmiot2) → walidujemy lokalnie przed wysyłką (`isValidNip`).
 *  - api-changelog 2.4.0: od 16.07.2026 dokument nie może zawierać
 *    niezalecanych znaków Unicode (W3C XML) ani processing instructions
 *    → `sanitizeXmlText` usuwa te znaki z pól tekstowych.
 *  - api-changelog 2.3.0: prolog opcjonalny; jeśli obecny — wyłącznie UTF-8.
 */

export class FaXmlValidationError extends Error {}

export interface PartySnapshot {
  name?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  nip?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  email?: string;
}

export interface InvoiceLineItem {
  name: string;
  quantity: number;
  unitNet: string | number;
  vatRate: string | number;
  totalNet: string | number;
  totalVat: string | number;
  totalGross: string | number;
}

export interface BuildFaXmlInput {
  invoice: Pick<
    Invoice,
    | 'number'
    | 'amount'
    | 'netAmount'
    | 'vatAmount'
    | 'vatRate'
    | 'currency'
    | 'issuedAt'
    | 'paidAt'
  > & {
    sellerSnapshot: unknown;
    buyerSnapshot: unknown;
    lineItems: unknown;
    /**
     * M-06 — rodzaj dokumentu. Do 2026-08-22 builder wpisywał `VAT` na sztywno,
     * bo korekt w systemie nie było. Korekta wysłana z `RodzajFaktury=VAT`
     * zostałaby przez KSeF przyjęta jako NOWA sprzedaż, a nie jako zmiana
     * poprzedniej — czyli podwoiłaby przychód w rejestrze.
     */
    kind?: 'VAT' | 'KOREKTA';
    /** Numer faktury korygowanej (wymagany przy KOREKTA). */
    correctedNumber?: string | null;
    /** Data wystawienia faktury korygowanej (wymagana przy KOREKTA). */
    correctedIssuedAt?: Date | null;
    /** Przyczyna korekty — pole obowiązkowe (art. 106j ust. 2 pkt 4). */
    correctionReason?: string | null;
  };
  /** System info do nagłówka (nazwa systemu wystawcy). */
  systemInfo?: string;
}

export interface BuiltFaXml {
  xml: string;
  /** Dane diagnostyczne do logów/audytu. */
  summary: {
    number: string;
    sellerNip: string;
    buyerNip: string | null;
    gross: string;
    net: string;
    vat: string;
  };
}

/** Normalizuje NIP do 10 cyfr; null gdy brak/za krótki. */
export function normalizeNip(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? digits : null;
}

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7] as const;

/**
 * Suma kontrolna NIP (waga 6-5-7-2-3-4-5-6-7 mod 11). KSeF PRD odrzuca
 * dokumenty z błędnym NIP Podmiot1/Podmiot2 — łapiemy to lokalnie, zanim
 * faktura w ogóle trafi do kolejki wysyłki.
 */
export function isValidNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;
  const sum = NIP_WEIGHTS.reduce((acc, w, i) => acc + w * Number(nip[i]), 0);
  const control = sum % 11;
  return control !== 10 && control === Number(nip[9]);
}

/**
 * Usuwa znaki niezalecane/zabronione przez specyfikację XML W3C, których KSeF
 * nie akceptuje od 16.07.2026 (api-changelog 2.4.0):
 *  - znaki sterujące C0 poza \t \n \r oraz DEL i blok C1 (#x7F–#x9F),
 *  - surrogaty i non-characters (#xFDD0–#xFDEF, #xFFFE, #xFFFF),
 *  - U+FFFE/U+FFFF na końcach płaszczyzn uzupełniających.
 */
export function sanitizeXmlText(value: string): string {
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    const discouraged =
      (cp <= 0x08) ||
      cp === 0x0b ||
      cp === 0x0c ||
      (cp >= 0x0e && cp <= 0x1f) ||
      (cp >= 0x7f && cp <= 0x9f) ||
      (cp >= 0xd800 && cp <= 0xdfff) ||
      (cp >= 0xfdd0 && cp <= 0xfdef) ||
      (cp & 0xfffe) === 0xfffe; // U+xFFFE / U+xFFFF w każdej płaszczyźnie
    if (!discouraged) out += ch;
  }
  return out;
}

/** Escapuje treść tekstową XML (po sanityzacji znaków niezalecanych). */
export function escapeXml(value: string): string {
  return sanitizeXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Kwota w formacie KSeF: kropka dziesiętna, 2 miejsca. */
export function formatMoney(value: string | number | { toString(): string }): string {
  const n = Number(value.toString());
  if (!Number.isFinite(n)) {
    throw new FaXmlValidationError(`Nieprawidłowa kwota: ${String(value)}`);
  }
  return n.toFixed(2);
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function partyDisplayName(p: PartySnapshot): string {
  return (
    p.name ||
    p.companyName ||
    [p.firstName, p.lastName].filter(Boolean).join(' ') ||
    'Nabywca'
  );
}

/** Stawki VAT dopuszczone w P_12 dla krajowej faktury VAT. */
export function vatRateLabel(rate: number): string {
  if ([23, 22, 8, 7, 5, 4, 3, 0].includes(rate)) return String(rate);
  throw new FaXmlValidationError(`Nieobsługiwana stawka VAT: ${rate}`);
}
