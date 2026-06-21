'use server';

import { apiFetch, ApiError } from '@/lib/api';

export interface MonitoringStatus {
  domain: string;
  enabled: boolean;
  url: string;
  lastStatus: 'UNKNOWN' | 'UP' | 'DOWN';
  lastCheckedAt: string | null;
  lastHttpStatus: number | null;
  lastError: string | null;
  downSince: string | null;
  /** B3+ — dostępność z ostatnich 30 dni (lub od początku monitorowania). */
  uptime: {
    pct: string;
    windowDays: number;
    sinceIso: string;
    downtimeSeconds: number;
    incidents: number;
    measuredFullWindow: boolean;
  } | null;
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
