'use client';

import { useEffect } from 'react';
import type { StatusPlatnosciPaynowDto } from '@verris/contracts';
import { trackPurchase } from '@/lib/analytics-events';

type Zakup = NonNullable<StatusPlatnosciPaynowDto['zakup']>;

/**
 * PB-08 (e2e 14.10) — zakup usługi zapłacony Paynow kończy się powrotem na stronę płatności, a formularz zamówienia
 * wysyła `purchase` tylko przy płatności z portfela bez przekierowania. Po powrocie z opłaconym zamówieniem
 * wysyłamy `purchase` tutaj — raz na kartę przeglądarki (odświeżenie nie dubluje; GA4 i Meta i tak deduplikują
 * po transaction_id / event_id = id usługi).
 */
export function ZakupPoPowrocie({ zakup }: { zakup: Zakup | null | undefined }) {
  useEffect(() => {
    if (!zakup) return;
    const klucz = `verris-zakup-wyslany:${zakup.transactionId}`;
    try {
      if (sessionStorage.getItem(klucz)) return;
      sessionStorage.setItem(klucz, '1');
    } catch {
      // Brak sessionStorage (tryb prywatny) — wyślemy; deduplikację zrobi GA4/Meta.
    }
    trackPurchase({
      transactionId: zakup.transactionId,
      value: zakup.wartosc,
      items: [{ item_name: zakup.nazwa, item_category: zakup.kategoria, price: zakup.wartosc, quantity: 1 }],
    });
  }, [zakup]);
  return null;
}
