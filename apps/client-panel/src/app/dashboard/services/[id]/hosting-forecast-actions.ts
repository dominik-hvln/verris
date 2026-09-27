'use server';

import { bezpiecznie, type Wynik as WynikAkcji } from '@/lib/wynik-akcji';

import type { ServiceForecastDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

async function fetchServiceForecastActionTresc(serviceId: string): Promise<ServiceForecastDto> {
  return apiFetch<ServiceForecastDto>(`/ai/services/${serviceId}/forecast`, {
    method: 'POST',
  });
}

export async function fetchServiceForecastAction(...a: Parameters<typeof fetchServiceForecastActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchServiceForecastActionTresc>>>> {
  return bezpiecznie(() => fetchServiceForecastActionTresc(...a));
}
