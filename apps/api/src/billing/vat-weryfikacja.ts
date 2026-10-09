import { InvoiceStatus, WalletTxStatus, WalletTxType } from '@verris/database';
import type { KlientPrismy } from './faktura-za-portfel.js';
import { VatNabywcyActions } from '../common/audit/audit.actions.js';
import { normalizujKraj } from './vat.js';

/**
 * Decyzja 2026-10-09 — cena netto dla nabywcy spoza UE tylko po weryfikacji przez obsługę.
 * Implementujemy techniczną bramkę; kwalifikację podatkową potwierdza księgowa.
 */

export const KOMUNIKAT_ZMIANA_PO_PLATNOSCI = 'Zmianę kraju rozliczenia zgłoś obsłudze.';

export const AKCJA_ZWERYFIKOWANY = VatNabywcyActions.ZWERYFIKOWANY;
export const AKCJA_COFNIETY = VatNabywcyActions.WERYFIKACJA_COFNIETA;
export const AKCJA_DANE_ZMIENIONE = VatNabywcyActions.DANE_ZMIENIONE;

/** Pola do `prisma.user.update` zerujące weryfikację (zmiana kraju albo NIP). */
export const BEZ_WERYFIKACJI = {
  vatWeryfikacjaAt: null,
  vatWeryfikacjaPrzez: null,
  vatWeryfikacjaPodstawa: null,
  vatWeryfikacjaKraj: null,
} as const;

/**
 * Weryfikacja liczy się tylko dla kraju, dla którego ją zrobiono — gdyby kraj zmienił się
 * drogą, która nie wyzerowała pól, nabywca i tak wraca do 23%.
 */
export function weryfikacjaPozaUeAktualna(u: {
  country: string | null | undefined;
  vatWeryfikacjaAt: Date | null | undefined;
  vatWeryfikacjaKraj: string | null | undefined;
} | null | undefined): boolean {
  if (!u?.vatWeryfikacjaAt || !u.vatWeryfikacjaKraj) return false;
  return normalizujKraj(u.vatWeryfikacjaKraj) === normalizujKraj(u.country);
}

/** NIP do porównania „czy się zmienił”: bez spacji, kropek, myślników; pusty = null. */
export function nipDoPorownania(nip: string | null | undefined): string | null {
  const n = (nip ?? '').toUpperCase().replace(/[\s.-]/g, '');
  return n || null;
}

/** Czy zapis zmienia kraj rozliczenia albo NIP (pola nieprzesłane = bez zmiany). */
export function zmianaDanychVat(
  stare: { country: string | null | undefined; nip: string | null | undefined },
  nowe: { country?: string | null; nip?: string | null },
): { kraj: boolean; nip: boolean } {
  return {
    kraj: nowe.country !== undefined && normalizujKraj(nowe.country) !== normalizujKraj(stare.country),
    nip: nowe.nip !== undefined && nipDoPorownania(nowe.nip) !== nipDoPorownania(stare.nip),
  };
}

/**
 * Pierwsza płatność = zaksięgowane doładowanie (Stripe/Paynow) albo opłacona faktura.
 * Od niej kraj i NIP zmienia tylko obsługa — dokumenty już wystawiono na te dane.
 */
export async function maPierwszaPlatnosc(db: KlientPrismy, userId: string): Promise<boolean> {
  const [wplaty, faktury] = await Promise.all([
    db.walletTransaction.count({
      where: { userId, type: WalletTxType.TOPUP, status: { in: [WalletTxStatus.COMPLETED, WalletTxStatus.REFUNDED] } },
    }),
    db.invoice.count({ where: { userId, status: InvoiceStatus.PAID } }),
  ]);
  return wplaty + faktury > 0;
}
