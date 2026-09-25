'use server';

import { apiFetch, ApiError } from '@/lib/api';
import { setAuthCookie } from '@/lib/auth';

export interface KontoDoPrzelaczenia {
  ownerUserId: string;
  nazwa: string;
  email: string;
  etykieta: string | null;
  wybraneUslugi: number;
}

/** PB-20 — konta, które inni udostępnili mi z mojego loginu. Błąd = pusta lista (przełącznik się chowa). */
export async function pobierzKontaAction(): Promise<KontoDoPrzelaczenia[]> {
  try {
    const r = await apiFetch<KontoDoPrzelaczenia[]>('/auth/accounts');
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

/** PB-20 — przełączenie: nowy token (ta sama sesja) w ciasteczku; `null` = powrót na własne konto. */
export async function przelaczKontoAction(ownerUserId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ownerUserId !== null && !/^[0-9a-f-]{36}$/i.test(ownerUserId)) return { ok: false, error: 'Nieprawidłowe konto.' };
  try {
    const r = await apiFetch<{ access_token: string }>('/auth/switch-account', { method: 'POST', body: JSON.stringify({ ownerUserId }) });
    await setAuthCookie(r.access_token);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError || e instanceof Error ? e.message : 'Nie udało się przełączyć konta.' };
  }
}
