import { PRODUCT_KIND_PL } from '@verris/contracts/klient';
import type { ServiceSummaryDto } from '@verris/contracts/klient';

/**
 * Rodzaj usługi na liście usług, pulpicie i w narzędziach hostingu – jedno miejsce zamiast map w każdym widoku.
 * Paczka 121: abonament Kreator Pro (KREATOR_PRO) to, jak e-mail marketing, produkt aplikacyjny – bez konta na
 * serwerze i bez domeny; zarządza się nim we własnej przestrzeni (Kreator stron), nie na karcie usługi hostingu.
 */
export type RodzajUslugi = ServiceSummaryDto['productKind'];

export const ETYKIETA_RODZAJU: Record<RodzajUslugi, string> = PRODUCT_KIND_PL;

/** Produkt bez konta na serwerze – nie dotyczą go narzędzia hostingu, DNS, kopie ani onboarding domeny. */
export function produktAplikacyjny(rodzaj: RodzajUslugi | null | undefined): boolean {
  return rodzaj === 'EMAIL_MARKETING' || rodzaj === 'KREATOR_PRO';
}

/** Gdzie klient zarządza usługą („Zarządzaj” na liście, link z pulpitu). */
export function adresUslugi(s: { id: string; productKind?: RodzajUslugi | null }): string {
  if (s.productKind === 'EMAIL_MARKETING') return `/dashboard/email-marketing/${s.id}`;
  if (s.productKind === 'KREATOR_PRO') return '/dashboard/kreator';
  return `/dashboard/services/${s.id}?kind=${s.productKind ?? 'HOSTING'}`;
}
