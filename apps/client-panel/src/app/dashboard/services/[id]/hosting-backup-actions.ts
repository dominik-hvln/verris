'use server';

import {
  getHostingBackups,
  getHostingRestorePreview,
  type HostingRestorePreview,
} from '@/app/dashboard/hosting-tools-data';
import type { HostingBackupsResponseDto } from '@verris/contracts';

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
