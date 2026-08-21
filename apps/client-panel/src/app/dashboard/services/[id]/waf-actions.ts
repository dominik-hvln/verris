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

export async function getWafStatus(serviceId: string): Promise<WafStatus | null> {
  try {
    return await apiFetch<WafStatus>(`/services/${serviceId}/waf`);
  } catch {
    return null;
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
