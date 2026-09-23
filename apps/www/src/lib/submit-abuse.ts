'use server';

import { headers } from 'next/headers';

/** N-13 — zgłoszenie nadużycia do API (/public/abuse). Forwarduje IP/UA (dowód przy sporze). */
export async function submitAbuse(input: {
  category: string;
  url: string;
  description: string;
  reporterName?: string;
  reporterEmail: string;
  goodFaith: boolean;
  website?: string;
}): Promise<{ ok: boolean; id?: string | null; error?: string }> {
  try {
    const apiUrl = (process.env.API_URL || 'http://api:3000').replace(/\/$/, '');
    const h = await headers();
    const xff = h.get('x-forwarded-for') ?? '';
    const ua = h.get('user-agent') ?? '';
    const res = await fetch(`${apiUrl}/public/abuse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}), ...(ua ? { 'user-agent': ua } : {}) },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string | null; message?: string | string[] };
    if (!res.ok) {
      const m = Array.isArray(data.message) ? data.message.join(' ') : data.message;
      return { ok: false, error: m || `HTTP ${res.status}` };
    }
    return { ok: true, id: data.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network' };
  }
}
