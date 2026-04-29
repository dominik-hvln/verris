'use server';

import type { HostingDomainsResponseDto } from '@ekohost/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchHostingDomainsAction(
  subscriptionId: string,
): Promise<HostingDomainsResponseDto> {
  return apiFetch<HostingDomainsResponseDto>(`/services/${subscriptionId}/hosting-domains`);
}
