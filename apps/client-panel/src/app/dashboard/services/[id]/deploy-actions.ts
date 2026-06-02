'use server';

import type {
  DeployFrequency,
  DeployJobMutationOkDto,
  DeployJobsResponseDto,
} from '@verris/contracts';
import { apiFetch, ApiError } from '@/lib/api';

export async function fetchDeployJobsAction(
  serviceId: string,
): Promise<DeployJobsResponseDto | null> {
  try {
    return await apiFetch<DeployJobsResponseDto>(`/services/${serviceId}/deploy-jobs`);
  } catch {
    return null;
  }
}

export type DeployJobMutationResult = DeployJobMutationOkDto | { ok: false; error: string };

export async function createDeployJobAction(
  serviceId: string,
  input: { domain: string; branch?: string; buildCommand?: string; frequency: DeployFrequency },
): Promise<DeployJobMutationResult> {
  try {
    await apiFetch<DeployJobMutationOkDto>(`/services/${serviceId}/deploy-jobs`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Nie udało się zapisać wdrożenia.' };
  }
}

export async function deleteDeployJobAction(
  serviceId: string,
  cronId: string,
): Promise<DeployJobMutationResult> {
  try {
    await apiFetch<DeployJobMutationOkDto>(`/services/${serviceId}/deploy-jobs/${cronId}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Nie udało się usunąć wdrożenia.' };
  }
}
