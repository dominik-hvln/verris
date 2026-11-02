'use server';

import { headers } from 'next/headers';
import type { WynikWysylki, ZgloszenieBeta } from './beta';

/**
 * Zgłoszenie do otwartych testów z verris.pl/beta → POST /public/beta/zgloszenia.
 * Server action forwarduje IP/User-Agent (limit per IP w API, dowód zgody RODO), jak lib/submit-lead.ts.
 */
export async function submitBeta(input: ZgloszenieBeta): Promise<WynikWysylki & { error?: string }> {
  try {
    const apiUrl = (process.env.API_URL || 'http://api:3000').replace(/\/$/, '');
    const h = await headers();
    const xff = h.get('x-forwarded-for') ?? '';
    const ua = h.get('user-agent') ?? '';
    const res = await fetch(`${apiUrl}/public/beta/zgloszenia`, {
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
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network' };
  }
}
