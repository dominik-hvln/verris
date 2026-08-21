'use server';

import type { ServiceHealthSummaryDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchServiceHealthAction(
  serviceId: string,
  refresh = false,
): Promise<ServiceHealthSummaryDto> {
  const q = refresh ? '?refresh=1' : '';
  return apiFetch<ServiceHealthSummaryDto>(`/services/${serviceId}/health${q}`);
}

export async function refreshServiceHealthAction(
  serviceId: string,
): Promise<ServiceHealthSummaryDto> {
  return apiFetch<ServiceHealthSummaryDto>(`/services/${serviceId}/health/refresh`, {
    method: 'POST',
  });
}
