'use server';

import type { ServiceDetailsDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchServiceDetailsAction(serviceId: string): Promise<ServiceDetailsDto> {
  return apiFetch<ServiceDetailsDto>(`/services/${serviceId}`);
}
