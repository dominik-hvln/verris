'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type SsoTarget = 'phpmyadmin' | 'webmail' | 'panel';

/**
 * SPRINT-1c — jednorazowy adres auto-logowania do panelu hostingu (DA).
 * URL jest ważny ~2 minuty i działa jeden raz; otwieramy go w nowej karcie.
 */
export async function createHostingSsoUrlAction(
  subscriptionId: string,
  target: SsoTarget,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<{ url: string }>(`/services/${subscriptionId}/hosting-sso-url`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    });
    return { ok: true, url: res.url };
  } catch (err) {
    const msg =
      err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Błąd';
    return { ok: false, error: msg };
  }
}

/** E-14 — webmail konkretnej skrzynki jednym kliknięciem: adres Roundcube i jednorazowy token. */
export async function createWebmailLoginAction(
  subscriptionId: string,
  email: string,
): Promise<{ ok: true; action: string; token: string } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<{ action: string; token: string }>(`/services/${subscriptionId}/hosting-webmail-login`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return { ok: true, action: res.action, token: res.token };
  } catch (err) {
    const msg =
      err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Błąd';
    return { ok: false, error: msg };
  }
}
