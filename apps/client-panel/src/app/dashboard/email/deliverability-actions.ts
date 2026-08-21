'use server';

import { apiFetch } from '@/lib/api';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DeliverabilityCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  suggestion?: { host: string; type: string; value: string };
}

export interface DeliverabilityReport {
  domain: string | null;
  sendingIp: string | null;
  generatedAt: string;
  score: number;
  checks: DeliverabilityCheck[];
  blacklists: Array<{ zone: string; listed: boolean }>;
}

export async function fetchDeliverability(serviceId: string): Promise<DeliverabilityReport | null> {
  try {
    return await apiFetch<DeliverabilityReport>(`/services/${serviceId}/deliverability`);
  } catch {
    return null;
  }
}
