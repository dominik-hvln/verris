'use server';

import type {
  HostingBackupsResponseDto,
  HostingCronJobsResponseDto,
  HostingFtpAccountsResponseDto,
} from '@verris/contracts';
import { apiFetch } from '@/lib/api';

/** Server-action wrappers so the in-service hub (client component) can fetch
 *  FTP / Cron / Backups without leaving the page. */

export async function fetchHostingFtpAction(
  serviceId: string,
): Promise<HostingFtpAccountsResponseDto> {
  return apiFetch<HostingFtpAccountsResponseDto>(`/services/${serviceId}/hosting-ftp`);
}

export async function fetchHostingCronAction(
  serviceId: string,
): Promise<HostingCronJobsResponseDto> {
  return apiFetch<HostingCronJobsResponseDto>(`/services/${serviceId}/hosting-cron`);
}

export async function fetchHostingBackupsAction(
  serviceId: string,
): Promise<HostingBackupsResponseDto> {
  return apiFetch<HostingBackupsResponseDto>(`/services/${serviceId}/hosting-backups`);
}
