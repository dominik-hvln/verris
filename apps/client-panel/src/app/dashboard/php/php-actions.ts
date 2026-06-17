'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

export interface PhpStatus {
  accountId: string;
  domain: string;
  version: string | null;
  availableVersions: string[];
  appliedAt: string | null;
  lastTask: {
    id: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
}

export async function fetchPhpStatus(serviceId: string): Promise<PhpStatus | null> {
  try {
    return await apiFetch<PhpStatus>(`/services/${serviceId}/hosting-php`);
  } catch {
    return null;
  }
}

export async function setPhpVersion(
  serviceId: string,
  version: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-php`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
    revalidatePath('/dashboard/php');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Błąd',
    };
  }
}
