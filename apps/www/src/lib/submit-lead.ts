'use server';

import { headers } from 'next/headers';

/**
 * Wysyła lead z formularza verris.pl do API (endpoint publiczny /public/leads).
 * Server action forwarduje IP/User-Agent użytkownika (dowód zgody RODO).
 * Zwraca prosty wynik — formularz decyduje o UI.
 */
export async function submitLead(input: {
  kind: 'MIGRATION' | 'CONTACT';
  email: string;
  name?: string;
  message?: string;
  source?: string;
  marketingConsent?: boolean;
  consentText?: string;
  page?: string;
}): Promise<{ ok: boolean; status?: 'pending' | 'received'; error?: string }> {
  try {
    const apiUrl = (process.env.API_URL || 'http://api:3000').replace(/\/$/, '');
    const h = await headers();
    const xff = h.get('x-forwarded-for') ?? '';
    const ua = h.get('user-agent') ?? '';

    const res = await fetch(`${apiUrl}/public/leads`, {
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

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { status?: 'pending' | 'received' };
    return { ok: true, status: data.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network' };
  }
}
