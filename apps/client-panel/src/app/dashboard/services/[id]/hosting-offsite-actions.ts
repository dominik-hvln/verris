'use server';

import { apiFetch } from '@/lib/api';

/**
 * S-1 — kopie off-site (poza węzłem) w panelu klienta.
 *
 * Panel nie ma dostępu do storage'u off-site (klucze rclone crypt są wyłącznie
 * na węźle), więc listowanie i pobranie archiwum to zadania węzła. Po pobraniu
 * archiwum pojawia się na zwykłej liście kopii i odtwarza się istniejącą,
 * bezpieczną ścieżką „Przywróć z tej kopii".
 */

export interface OffsiteArchiveDto {
  name: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
}

export interface OffsiteTaskDto {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  mode: 'list' | 'fetch';
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface OffsiteRestoreStatusDto {
  accountId: string;
  domain: string | null;
  offsite: { protected: boolean; lastRunAt: string | null };
  busy: boolean;
  snapshot: string | null;
  listedAt: string | null;
  archives: OffsiteArchiveDto[];
  lastList: OffsiteTaskDto | null;
  lastFetch: OffsiteTaskDto | null;
  fetchedArchive: string | null;
}

export async function fetchOffsiteStatusAction(
  serviceId: string,
): Promise<OffsiteRestoreStatusDto> {
  return apiFetch<OffsiteRestoreStatusDto>(`/services/${serviceId}/hosting-offsite`);
}

export async function queueOffsiteListAction(
  serviceId: string,
  snapshot?: string,
): Promise<OffsiteRestoreStatusDto> {
  return apiFetch<OffsiteRestoreStatusDto>(`/services/${serviceId}/hosting-offsite/list`, {
    method: 'POST',
    body: JSON.stringify({ snapshot: snapshot || undefined }),
  });
}

export async function queueOffsiteFetchAction(
  serviceId: string,
  archive: string,
  snapshot?: string,
): Promise<OffsiteRestoreStatusDto> {
  return apiFetch<OffsiteRestoreStatusDto>(`/services/${serviceId}/hosting-offsite/fetch`, {
    method: 'POST',
    body: JSON.stringify({ archive, snapshot: snapshot || undefined }),
  });
}
