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
