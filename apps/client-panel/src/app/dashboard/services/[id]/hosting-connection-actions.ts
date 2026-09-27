'use server';

import { bezpiecznie, type Wynik as WynikAkcji } from '@/lib/wynik-akcji';

import type { ServiceConnectionInfoDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

async function fetchConnectionInfoActionTresc(
  serviceId: string,
): Promise<ServiceConnectionInfoDto> {
  return apiFetch<ServiceConnectionInfoDto>(`/services/${serviceId}/connection-info`);
}

export async function fetchConnectionInfoAction(...a: Parameters<typeof fetchConnectionInfoActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchConnectionInfoActionTresc>>>> {
  return bezpiecznie(() => fetchConnectionInfoActionTresc(...a));
}
