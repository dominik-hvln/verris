'use server';

import type {
  HostingStagingCreatedDto,
  HostingStagingMutationOkDto,
  HostingStagingResponseDto,
} from '@verris/contracts';
import { apiFetch, ApiError } from '@/lib/api';

export async function fetchHostingStagingAction(
  serviceId: string,
): Promise<HostingStagingResponseDto | null> {
  try {
    return await apiFetch<HostingStagingResponseDto>(`/services/${serviceId}/hosting-staging`);
  } catch {
    return null;
  }
}

export type HostingStagingCreateResult =
  | (HostingStagingCreatedDto & { error?: undefined })
  | { ok: false; error: string };

export async function createHostingStagingAction(
  serviceId: string,
  input: { domain: string; label?: string; withDatabase?: boolean },
): Promise<HostingStagingCreateResult> {
  try {
    return await apiFetch<HostingStagingCreatedDto>(`/services/${serviceId}/hosting-staging`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Nie udało się utworzyć środowiska staging.' };
  }
}

export type HostingStagingDeleteResult = HostingStagingMutationOkDto | { ok: false; error: string };

export async function deleteHostingStagingAction(
  serviceId: string,
  input: { domain: string; subdomain: string },
): Promise<HostingStagingDeleteResult> {
  try {
    await apiFetch<HostingStagingMutationOkDto>(`/services/${serviceId}/hosting-staging`, {
      method: 'DELETE',
      body: JSON.stringify(input),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Nie udało się usunąć środowiska staging.' };
  }
}
