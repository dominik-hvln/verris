'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type WafMode = 'OFF' | 'DETECTION' | 'ON';

export interface WafStatus {
  accountId: string;
  domain: string;
  mode: WafMode;
  appliedAt: string | null;
  lastTask: {
    id: string;
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
}

export const BLAD_ODCZYTU_WAF = 'Nie udało się wczytać stanu zapory — spróbuj ponownie.';

export type OdczytWaf = { ok: true; status: WafStatus } | { ok: false; brakKonta: boolean; error: string };

/**
 * Noc 11→12.10 — każdy błąd odczytu (sieć, 5xx, restart po wdrożeniu) zamieniał się w `null`, a zakładka pokazywała
 * wtedy „WAF będzie dostępny po aktywacji konta” i przestawała odpytywać. Brak konta to 400 z API
 * (waf.service.ts requireOwnedSub) — tylko on jest stanem; reszta to błąd z możliwością ponowienia.
 */
export async function getWafStatus(serviceId: string): Promise<OdczytWaf> {
  try {
    return { ok: true, status: await apiFetch<WafStatus>(`/services/${serviceId}/waf`) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) return { ok: false, brakKonta: true, error: err.message };
    return { ok: false, brakKonta: false, error: BLAD_ODCZYTU_WAF };
  }
}

export async function setWafMode(
  serviceId: string,
  mode: WafMode,
): Promise<WafStatus | { error: string }> {
  try {
    return await apiFetch<WafStatus>(`/services/${serviceId}/waf/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Błąd zmiany trybu WAF' };
  }
}
