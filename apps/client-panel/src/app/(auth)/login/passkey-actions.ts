'use server';

import { apiFetch } from '@/lib/api';
import { setAuthCookie } from '@/lib/auth';
import { sesjaKlienta } from '@/lib/tylko-klient';

/** Czy serwer ma skonfigurowane passkey (RP). Gdy false — nie pokazujemy przycisku. */
export async function getPasskeyAvailability(): Promise<boolean> {
  try {
    const res = await apiFetch<{ available: boolean }>('/auth/webauthn/status', {
      unauthenticated: true,
    });
    return res.available === true;
  } catch {
    return false;
  }
}

/** Passkey login step 2 — set the session cookie after browser-side verify. */
export async function setPasskeyAuthCookie(
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const klient = await sesjaKlienta(accessToken);
    if (!klient.ok) return klient;
    await setAuthCookie(accessToken);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Nie udało się zapisać sesji' };
  }
}
