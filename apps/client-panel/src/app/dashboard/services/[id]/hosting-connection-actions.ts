'use server';

import type { ServiceConnectionInfoDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchConnectionInfoAction(
  serviceId: string,
): Promise<ServiceConnectionInfoDto> {
  return apiFetch<ServiceConnectionInfoDto>(`/services/${serviceId}/connection-info`);
}
