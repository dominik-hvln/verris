'use server';

import { apiFetch, ApiError } from '@/lib/api';

export interface StagingEnvStatus {
  domain: string;
  stagingDomain: string;
  stagingUrl: string;
  exists: boolean;
  createdAt: string | null;
  syncedAt: string | null;
  lastTask: {
    id: string;
    direction: 'TO_STAGING' | 'TO_LIVE' | null;
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
}

type Result = StagingEnvStatus | { error: string };

function wrap(err: unknown): { error: string } {
  return { error: err instanceof ApiError ? err.message : 'Błąd operacji' };
}

export async function getStagingEnv(serviceId: string): Promise<StagingEnvStatus | null> {
  try {
    return await apiFetch<StagingEnvStatus>(`/services/${serviceId}/staging-env`);
  } catch {
    return null;
  }
}

export async function createOrRefreshStaging(serviceId: string): Promise<Result> {
  try {
    return await apiFetch<StagingEnvStatus>(`/services/${serviceId}/staging-env/create`, {
      method: 'POST',
    });
  } catch (err) {
    return wrap(err);
  }
}

export async function pushStagingToLive(serviceId: string): Promise<Result> {
  try {
    return await apiFetch<StagingEnvStatus>(`/services/${serviceId}/staging-env/push`, {
      method: 'POST',
    });
  } catch (err) {
    return wrap(err);
  }
}

export async function deleteStagingEnv(serviceId: string): Promise<Result> {
  try {
    return await apiFetch<StagingEnvStatus>(`/services/${serviceId}/staging-env`, {
      method: 'DELETE',
    });
  } catch (err) {
    return wrap(err);
  }
}
