import { Prisma, SiteLeadKind, SiteLeadStatus } from '@verris/database';

/**
 * A2-02 (paczka 109) — okresy przechowywania danych z formularzy verris.pl (model `SiteLead`). Te same liczby są
 * w Polityce prywatności 1.2.0 (§2.10 i tabela §4) i w RCPD (A16) — zmiana tutaj = zmiana dokumentów.
 * Wcześniej `SiteLead` nie miał żadnej retencji: imię, telefon, IP i przeglądarka zostawały bez końca.
 *
 * Okresy to propozycja do zatwierdzenia przez właściciela (docs/legal/drafts/ZMIANY_1.1.0-1.2.0.md, „DO SPRAWDZENIA”).
 */
export const RETENCJA_LEADOW_DNI = {
  /** Formularz kontaktowy: czas na odpowiedź i dalszą korespondencję w tej sprawie. */
  KONTAKT: 365,
  /** Prośba o telefon: „numer wykorzystamy tylko do tej rozmowy” — krótko, z zapasem na oddzwonienie i pytania po niej. */
  TELEFON: 90,
  /** Plan migracji bez zgody na wiadomości — plan wysłany, nic więcej nie robimy. */
  PLAN_BEZ_ZGODY: 30,
  /** Zgoda na wiadomości niepotwierdzona w mailu — wygasa. */
  ZGODA_NIEPOTWIERDZONA: 7,
  /** Potwierdzona zgoda na wiadomości — najdłużej tyle od potwierdzenia (później usuwamy albo pytamy od nowa). */
  ZGODA_POTWIERDZONA: 730,
  /** Po wypisie — tyle trzymamy ślad wycofania zgody, potem rekord znika. */
  PO_WYPISIE: 30,
} as const;

const DZIEN_MS = 24 * 60 * 60 * 1000;
const przed = (now: Date, dni: number) => new Date(now.getTime() - dni * DZIEN_MS);

/** Warunek `deleteMany` — rekordy `SiteLead`, którym minął okres przechowywania w chwili `now`. */
export function warunekRetencjiLeadow(now: Date): Prisma.SiteLeadWhereInput {
  const r = RETENCJA_LEADOW_DNI;
  return {
    OR: [
      { kind: SiteLeadKind.CONTACT, status: { not: SiteLeadStatus.UNSUBSCRIBED }, createdAt: { lt: przed(now, r.KONTAKT) } },
      { kind: SiteLeadKind.CALLBACK, createdAt: { lt: przed(now, r.TELEFON) } },
      { kind: SiteLeadKind.MIGRATION, status: SiteLeadStatus.RECEIVED, createdAt: { lt: przed(now, r.PLAN_BEZ_ZGODY) } },
      { kind: SiteLeadKind.MIGRATION, status: SiteLeadStatus.PENDING, createdAt: { lt: przed(now, r.ZGODA_NIEPOTWIERDZONA) } },
      // Potwierdzona zgoda liczy się od potwierdzenia; rekord bez daty potwierdzenia (sprzed 1.1.0) — od wysłania.
      {
        kind: SiteLeadKind.MIGRATION,
        status: SiteLeadStatus.CONFIRMED,
        OR: [
          { confirmedAt: { lt: przed(now, r.ZGODA_POTWIERDZONA) } },
          { confirmedAt: null, createdAt: { lt: przed(now, r.ZGODA_POTWIERDZONA) } },
        ],
      },
      { status: SiteLeadStatus.UNSUBSCRIBED, updatedAt: { lt: przed(now, r.PO_WYPISIE) } },
    ],
  };
}
