'use server';

import { bezpiecznie, type Wynik as WynikAkcji } from '@/lib/wynik-akcji';

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

async function fetchOffsiteStatusActionTresc(
  serviceId: string,
): Promise<OffsiteRestoreStatusDto> {
  return apiFetch<OffsiteRestoreStatusDto>(`/services/${serviceId}/hosting-offsite`);
}

async function queueOffsiteListActionTresc(
  serviceId: string,
  snapshot?: string,
): Promise<OffsiteRestoreStatusDto> {
  return apiFetch<OffsiteRestoreStatusDto>(`/services/${serviceId}/hosting-offsite/list`, {
    method: 'POST',
    body: JSON.stringify({ snapshot: snapshot || undefined }),
  });
}

async function queueOffsiteFetchActionTresc(
  serviceId: string,
  archive: string,
  snapshot?: string,
): Promise<OffsiteRestoreStatusDto> {
  return apiFetch<OffsiteRestoreStatusDto>(`/services/${serviceId}/hosting-offsite/fetch`, {
    method: 'POST',
    body: JSON.stringify({ archive, snapshot: snapshot || undefined }),
  });
}

export async function fetchOffsiteStatusAction(...a: Parameters<typeof fetchOffsiteStatusActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchOffsiteStatusActionTresc>>>> {
  return bezpiecznie(() => fetchOffsiteStatusActionTresc(...a));
}

export async function queueOffsiteListAction(...a: Parameters<typeof queueOffsiteListActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof queueOffsiteListActionTresc>>>> {
  return bezpiecznie(() => queueOffsiteListActionTresc(...a));
}

export async function queueOffsiteFetchAction(...a: Parameters<typeof queueOffsiteFetchActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof queueOffsiteFetchActionTresc>>>> {
  return bezpiecznie(() => queueOffsiteFetchActionTresc(...a));
}
