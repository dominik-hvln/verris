'use server';

import { cookies, headers } from 'next/headers';

/**
 * Przekazuje zdarzenie Lead do Meta Conversions API przez nasze API (endpoint publiczny).
 *
 * Wołane z klienta (generateLead) po wysłaniu formularza na verris.pl. Server action ma
 * dostęp do IP użytkownika (x-forwarded-for od Caddy), User-Agenta oraz cookies `_fbp`/`_fbc`,
 * więc dopasowanie opiera się na danych użytkownika. Deduplikacja z Pixelem przez ten sam `eventId`.
 *
 * BEZ e-maila — świadomie (patrz MetaCapiService.sendLead). Best-effort: nigdy nie rzuca.
 */
export async function relayLeadToCapi(input: {
  eventId: string;
  method?: string;
  eventSourceUrl?: string;
}): Promise<void> {
  try {
    const apiUrl = (process.env.API_URL || 'http://api:3000').replace(/\/$/, '');
    const [c, h] = [await cookies(), await headers()];
    const payload = {
      eventId: input.eventId,
      method: input.method,
      eventSourceUrl: input.eventSourceUrl,
      fbp: c.get('_fbp')?.value,
      fbc: c.get('_fbc')?.value,
      clientIp: h.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: h.get('user-agent') ?? undefined,
    };
    await fetch(`${apiUrl}/analytics/meta/lead`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
  } catch {
    /* best-effort */
  }
}
