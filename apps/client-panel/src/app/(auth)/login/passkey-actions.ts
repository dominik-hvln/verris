'use server';

import { apiFetch, ApiError } from '@/lib/api';
import { setAuthCookie } from '@/lib/auth';

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

/** Passkey login step 1 — authentication options (e-mail opcjonalny). */
export async function getPasskeyLoginOptions(
  email?: string,
): Promise<{ ok: true; options: unknown } | { ok: false; error: string }> {
  try {
    const options = await apiFetch<unknown>('/auth/webauthn/login/options', {
      method: 'POST',
      body: JSON.stringify(email?.trim() ? { email: email.trim() } : {}),
      unauthenticated: true,
    });
    return { ok: true, options };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Błąd' };
  }
}

/** Passkey login step 2 — verify assertion, set the session cookie. */
export async function verifyPasskeyLogin(
  response: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const data = await apiFetch<{ access_token?: string }>('/auth/webauthn/login/verify', {
      method: 'POST',
      body: JSON.stringify({ response }),
      unauthenticated: true,
    });
    if (!data.access_token) return { ok: false, error: 'Brak tokenu sesji' };
    await setAuthCookie(data.access_token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Logowanie passkey nie powiodło się' };
  }
}
