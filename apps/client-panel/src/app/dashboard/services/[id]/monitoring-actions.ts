'use server';

import { apiFetch, ApiError } from '@/lib/api';

export interface MonitoringStatus {
  domain: string;
  enabled: boolean;
  /** MON-6 — czy wysyłamy maile o awarii/powrocie/SSL. */
  notifyEmail: boolean;
  url: string;
  lastStatus: 'UNKNOWN' | 'UP' | 'DOWN';
  lastCheckedAt: string | null;
  lastHttpStatus: number | null;
  /** MON-4 — czas odpowiedzi ostatniego udanego sprawdzenia (ms). */
  lastResponseMs: number | null;
  lastError: string | null;
  downSince: string | null;
  /** MON-5 — data wygaśnięcia certyfikatu TLS (ISO) lub null. */
  tlsExpiresAt: string | null;
  /** B3+ — dostępność z ostatnich 30 dni (lub od początku monitorowania). */
  uptime: {
    pct: string;
    windowDays: number;
    sinceIso: string;
    downtimeSeconds: number;
    incidents: number;
    measuredFullWindow: boolean;
  } | null;
  /** MON-3 — płatny tier monitoringu (szybkie sprawdzanie). */
  paid: {
    active: boolean;
    cancelAtPeriodEnd: boolean;
    nextChargeAt: string | null;
    offered: boolean;
    monthlyPrice: number;
    freeIntervalMinutes: number;
    paidIntervalMinutes: number;
  };
  events: Array<{
    id: string;
    type: 'DOWN' | 'RECOVERED';
    message: string | null;
    httpStatus: number | null;
    durationS: number | null;
    createdAt: string;
  }>;
}

export async function getMonitoringStatus(serviceId: string): Promise<MonitoringStatus | null> {
  try {
    return await apiFetch<MonitoringStatus>(`/services/${serviceId}/monitoring`);
  } catch {
    return null;
  }
}

export async function setMonitoringEnabled(
  serviceId: string,
  enabled: boolean,
): Promise<MonitoringStatus | { error: string }> {
  try {
    return await apiFetch<MonitoringStatus>(`/services/${serviceId}/monitoring`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Błąd zapisu' };
  }
}

// MON-6 — przełącz powiadomienia e-mail (monitoring działa niezależnie).
export async function setMonitoringNotify(
  serviceId: string,
  enabled: boolean,
): Promise<MonitoringStatus | { error: string }> {
  try {
    return await apiFetch<MonitoringStatus>(`/services/${serviceId}/monitoring/notify`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Błąd zapisu' };
  }
}

// MON-3 — włącz/wyłącz płatny monitoring (szybkie sprawdzanie, opłata z portfela).
export async function setPaidMonitoring(
  serviceId: string,
  enabled: boolean,
): Promise<MonitoringStatus | { error: string }> {
  try {
    return await apiFetch<MonitoringStatus>(`/services/${serviceId}/monitoring/paid`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Błąd zapisu' };
  }
}
