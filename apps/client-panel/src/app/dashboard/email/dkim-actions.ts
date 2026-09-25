'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** E-16 — włączenie podpisu DKIM dla domeny konta (klucz na serwerze + rekord w strefie DNS). */
export async function enableDkimAction(serviceId: string, domain: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-email/dkim`, { method: 'POST', body: JSON.stringify({ domain }) });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Nie udało się włączyć DKIM.' };
  }
}
