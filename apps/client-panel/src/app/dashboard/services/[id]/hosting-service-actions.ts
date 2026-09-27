'use server';

import { bezpiecznie, type Wynik as WynikAkcji } from '@/lib/wynik-akcji';

import type { ServiceDetailsDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

async function fetchServiceDetailsActionTresc(serviceId: string): Promise<ServiceDetailsDto> {
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

export async function fetchServiceDetailsAction(...a: Parameters<typeof fetchServiceDetailsActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchServiceDetailsActionTresc>>>> {
  return bezpiecznie(() => fetchServiceDetailsActionTresc(...a));
}
