'use server';

import type { ServiceDetailsDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchServiceDetailsAction(serviceId: string): Promise<ServiceDetailsDto> {
  return apiFetch<ServiceDetailsDto>(`/services/${serviceId}`);
}

// PERF-1 — lekki fetch tylko typu usługi (bez live-probe health), aby hub
// natychmiast dobrał właściwy zestaw zakładek przy wejściu z deep-linku.
export async function fetchServiceKindAction(
  serviceId: string,
): Promise<{ productKind: 'HOSTING' | 'EMAIL'; serviceTag: string | null }> {
  return apiFetch<{ productKind: 'HOSTING' | 'EMAIL'; serviceTag: string | null }>(
    `/services/${serviceId}/kind`,
  );
}
