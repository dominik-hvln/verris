import type { Prisma } from '@verris/database';
import type { FormaPlatnosciFa } from '../ksef/fa-xml.types.js';
import { DOSTAWCA_DOLADOWANIE } from './doladowanie.js';

/**
 * Sposób zapłaty faktury — JEDNO źródło dla PDF-a panelu („Forma zapłaty”) i dla sekcji
 * `Platnosc` w XML FA(3). Do 2026-10-12 etykieta żyła tylko w `InvoicesService`, więc
 * faktura w KSeF nie mówiła, jak zapłacono, a PDF mówił.
 *
 * Kody FA(3) (TFormaPlatnosci): 2 — karta, 6 — przelew. Paynow (BLIK, pay-by-link) i portfel
 * przedpłacony nie mają własnego kodu — idą jako `PlatnoscInna` z opisem, zamiast zgadywać kod.
 */
export interface FormaZaplaty {
  etykieta: string;
  fa: FormaPlatnosciFa;
}

type Db = { walletTransaction: Pick<Prisma.TransactionClient['walletTransaction'], 'findUnique'> };

export async function formaZaplatyFaktury(
  db: Db,
  faktura: { provider: string | null; providerRef: string | null },
): Promise<FormaZaplaty> {
  if (faktura.provider === DOSTAWCA_DOLADOWANIE && faktura.providerRef) {
    // Dokument za doładowanie: providerRef = wpis księgi, a ten wie, którą bramką przyszła wpłata.
    const wpis = await db.walletTransaction.findUnique({
      where: { id: faktura.providerRef },
      select: { paymentProvider: true },
    });
    if (wpis?.paymentProvider === 'PAYNOW') {
      return { etykieta: 'Płatność online (Paynow)', fa: { opis: 'Płatność online (Paynow)' } };
    }
    // F3.6 — wpłata na rachunek zaksięgowana przez Finanse.
    if (wpis?.paymentProvider === 'PRZELEW') return { etykieta: 'Przelew bankowy', fa: { kod: 6 } };
  }
  if (faktura.provider === 'STRIPE' || faktura.provider === DOSTAWCA_DOLADOWANIE) {
    return { etykieta: 'Karta płatnicza', fa: { kod: 2 } };
  }
  return { etykieta: 'Portfel Verris', fa: { opis: 'Portfel Verris (środki przedpłacone)' } };
}
