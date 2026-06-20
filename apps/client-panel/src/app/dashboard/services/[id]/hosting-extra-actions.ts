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

type MutResult = { ok: true } | { ok: false; error: string };
function mutErr(e: unknown): string {
  return e instanceof Error ? e.message : 'Operacja nie powiodła się.';
}

// --- FTP (konta) ---
export async function createHostingFtpAction(
  serviceId: string,
  input: { username: string; password: string; directory?: string },
): Promise<MutResult> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-ftp`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mutErr(e) };
  }
}

export async function deleteHostingFtpAction(
  serviceId: string,
  username: string,
): Promise<MutResult> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-ftp/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mutErr(e) };
  }
}

// --- Cron ---
export async function createHostingCronAction(
  serviceId: string,
  input: {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
    command: string;
  },
): Promise<MutResult> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-cron`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mutErr(e) };
  }
}

export async function deleteHostingCronAction(
  serviceId: string,
  cronId: string,
): Promise<MutResult> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-cron/${encodeURIComponent(cronId)}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mutErr(e) };
  }
}
