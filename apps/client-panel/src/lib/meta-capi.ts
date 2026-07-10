'use server';

import { cookies, headers } from 'next/headers';
import { apiFetch } from './api';

/**
 * Przekazuje zdarzenie Purchase do Meta Conversions API przez nasze API.
 *
 * Wołane z klienta (trackPurchase) po udanym zakupie — server action ma dostęp
 * do IP użytkownika (x-forwarded-for od Caddy), User-Agenta oraz cookies `_fbp`/`_fbc`,
 * więc dopasowanie (EMQ) opiera się na danych użytkownika, nie kontenera panelu.
 *
 * Deduplikacja z Pixelem: przekazujemy TEN SAM `eventId` (`purchase-<transactionId>`).
 * Best-effort — nigdy nie rzuca; pomiar nie może wywrócić UI po zakupie.
 */
export async function relayPurchaseToCapi(input: {
  eventId: string;
  value: number;
  currency?: string;
  contentName?: string;
  eventSourceUrl?: string;
}): Promise<void> {
  try {
    const [c, h] = [await cookies(), await headers()];
    const fbp = c.get('_fbp')?.value;
    const fbc = c.get('_fbc')?.value;
    const clientIp = h.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = h.get('user-agent') ?? undefined;

    await apiFetch('/analytics/meta/purchase', {
      method: 'POST',
      body: JSON.stringify({
        eventId: input.eventId,
        value: input.value,
        currency: input.currency ?? 'PLN',
        contentName: input.contentName,
        eventSourceUrl: input.eventSourceUrl,
        fbp,
        fbc,
        clientIp,
        userAgent,
      }),
    });
  } catch {
    /* best-effort — cisza; endpoint i tak jest fire-and-forget po stronie serwera */
  }
}
