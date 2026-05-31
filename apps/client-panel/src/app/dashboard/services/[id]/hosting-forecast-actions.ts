'use server';

import type { ServiceForecastDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchServiceForecastAction(serviceId: string): Promise<ServiceForecastDto> {
  return apiFetch<ServiceForecastDto>(`/ai/services/${serviceId}/forecast`, {
    method: 'POST',
  });
}
