'use server';

import {
  getHostingBackups,
  getHostingRestorePreview,
  type HostingRestorePreview,
} from '@/app/dashboard/hosting-tools-data';
import type { HostingBackupsResponseDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchHostingBackupsAction(
  serviceId: string,
): Promise<HostingBackupsResponseDto> {
  return getHostingBackups(serviceId);
}

export async function fetchHostingRestorePreviewAction(
  serviceId: string,
  backupId?: string,
): Promise<HostingRestorePreview> {
  return getHostingRestorePreview(serviceId, backupId);
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

export async function enqueueHostingRestoreAction(
  serviceId: string,
  input: EnqueueHostingRestoreInput,
): Promise<HostingRestoreJobDto> {
  return apiFetch<HostingRestoreJobDto>(`/services/${serviceId}/hosting-restore`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchHostingRestoreStatusAction(
  serviceId: string,
): Promise<HostingRestoreJobDto | null> {
  return apiFetch<HostingRestoreJobDto | null>(`/services/${serviceId}/hosting-restore/status`);
}
