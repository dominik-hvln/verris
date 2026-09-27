'use server';

import { bezpiecznie, type Wynik as WynikAkcji } from '@/lib/wynik-akcji';

import { getHostingBackups } from '@/app/dashboard/hosting-tools-data';
import type { HostingBackupsResponseDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

async function fetchHostingBackupsActionTresc(
  serviceId: string,
): Promise<HostingBackupsResponseDto> {
  return getHostingBackups(serviceId);
}

export interface HostingRestoreJobDto {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SAFETY_BACKUP' | 'RESTORING' | 'COMPLETED' | 'FAILED';
  backupFileName: string;
  scope: { files: boolean; databases: boolean; email: boolean };
  safetyBackup: boolean;
  isAdminInitiated: boolean;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  active: boolean;
}

export interface EnqueueHostingRestoreInput {
  backupId: string;
  scopeFiles: boolean;
  scopeDatabases: boolean;
  scopeEmail: boolean;
  safetyBackup: boolean;
  confirmDomain: string;
}

async function enqueueHostingRestoreActionTresc(
  serviceId: string,
  input: EnqueueHostingRestoreInput,
): Promise<HostingRestoreJobDto> {
  return apiFetch<HostingRestoreJobDto>(`/services/${serviceId}/hosting-restore`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function fetchHostingRestoreStatusActionTresc(
  serviceId: string,
): Promise<HostingRestoreJobDto | null> {
  return apiFetch<HostingRestoreJobDto | null>(`/services/${serviceId}/hosting-restore/status`);
}

export async function fetchHostingBackupsAction(...a: Parameters<typeof fetchHostingBackupsActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchHostingBackupsActionTresc>>>> {
  return bezpiecznie(() => fetchHostingBackupsActionTresc(...a));
}

export async function enqueueHostingRestoreAction(...a: Parameters<typeof enqueueHostingRestoreActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof enqueueHostingRestoreActionTresc>>>> {
  return bezpiecznie(() => enqueueHostingRestoreActionTresc(...a));
}

export async function fetchHostingRestoreStatusAction(...a: Parameters<typeof fetchHostingRestoreStatusActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchHostingRestoreStatusActionTresc>>>> {
  return bezpiecznie(() => fetchHostingRestoreStatusActionTresc(...a));
}
