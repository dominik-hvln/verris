'use server';

import { apiFetch, ApiError } from '@/lib/api';

export interface WordpressStatus {
  domain: string;
  task: {
    id: string;
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
}

export interface WordpressInstallResult {
  ok: true;
  taskId: string;
  domain: string;
  adminUrl: string;
  adminUser: string;
  adminPassword: string;
  note: string;
}

export async function getWordpressStatus(serviceId: string): Promise<WordpressStatus | null> {
  try {
    return await apiFetch<WordpressStatus>(`/services/${serviceId}/wordpress/status`);
  } catch {
    return null;
  }
}

export async function installWordpress(
  serviceId: string,
  input: { siteTitle: string; adminUser: string; adminEmail: string; locale?: string },
): Promise<WordpressInstallResult | { ok: false; error: string }> {
  try {
    return await apiFetch<WordpressInstallResult>(`/services/${serviceId}/wordpress/install`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Błąd instalacji' };
  }
}
