'use server';

import type { HostingDaLinksResponseDto, HostingMysqlDatabasesResponseDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchHostingDatabasesAction(
  subscriptionId: string,
): Promise<HostingMysqlDatabasesResponseDto> {
  return apiFetch<HostingMysqlDatabasesResponseDto>(`/services/${subscriptionId}/hosting-databases`);
}

export async function fetchHostingDaLinksAction(
  subscriptionId: string,
): Promise<HostingDaLinksResponseDto> {
  return apiFetch<HostingDaLinksResponseDto>(`/services/${subscriptionId}/hosting-da-links`);
}

export async function createHostingDatabaseAction(
  subscriptionId: string,
  input: { name: string; user: string; password: string },
): Promise<{ ok: true; database: string; username: string } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<{ database: string; username: string }>(
      `/services/${subscriptionId}/hosting-databases`,
      { method: 'POST', body: JSON.stringify(input) },
    );
    return { ok: true, database: res.database, username: res.username };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nie udało się utworzyć bazy.' };
  }
}

export async function deleteHostingDatabaseAction(
  subscriptionId: string,
  fullName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(`/services/${subscriptionId}/hosting-databases/${encodeURIComponent(fullName)}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nie udało się usunąć bazy.' };
  }
}
