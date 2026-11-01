'use server';

import { headers } from 'next/headers';

/**
 * Prośba o telefon zwrotny z pasa „Wolisz porozmawiać?” → POST /public/leads/callback.
 * Server action forwarduje IP/User-Agent (limit per IP w API, dowód informacji RODO), jak lib/submit-lead.ts.
 */
export type PoraOddzwonienia = 'rano' | 'poludnie' | 'popoludnie';

export async function submitCallback(input: {
  name: string;
  phone: string;
  preferredTime: PoraOddzwonienia;
  consentText: string;
  page?: string;
  captchaToken?: string;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  try {
    const apiUrl = (process.env.API_URL || 'http://api:3000').replace(/\/$/, '');
    const h = await headers();
    const xff = h.get('x-forwarded-for') ?? '';
    const ua = h.get('user-agent') ?? '';
    const res = await fetch(`${apiUrl}/public/leads/callback`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(xff ? { 'x-forwarded-for': xff } : {}),
        ...(ua ? { 'user-agent': ua } : {}),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network' };
  }
}
