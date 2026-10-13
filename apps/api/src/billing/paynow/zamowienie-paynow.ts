import type { Prisma } from '@verris/database';

/**
 * Płatności Paynow za zamówienie konkretnej usługi (`meta.kind = 'zamowienie'`, billing.service.ts
 * zaplacZamowieniePaynow / zaplacUslugePaynow) — warunek do zapytań o rekordy PaynowPlatnosc tej usługi.
 */
export function gdziePlatnoscZamowienia(subscriptionId: string, typ?: 'nowa' | 'odnowienie'): Prisma.PaynowPlatnoscWhereInput {
  return {
    AND: [
      { meta: { path: ['kind'], equals: 'zamowienie' } },
      { meta: { path: ['subscriptionId'], equals: subscriptionId } },
      ...(typ ? [{ meta: { path: ['zamowienieTyp'], equals: typ } }] : []),
    ],
  };
}

/** Klucz pierwszego obciążenia za usługę (subscriptions.service.ts payFromWalletAndProvision / aktywacja aplikacyjna). */
export const kluczPierwszejOplaty = (subscriptionId: string) => `sub-${subscriptionId}-initial`;
