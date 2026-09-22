'use server';

import type { HostingDnsRecordsResponseDto, HostingDomainsResponseDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchHostingDomainsAction(
  subscriptionId: string,
): Promise<HostingDomainsResponseDto> {
  return apiFetch<HostingDomainsResponseDto>(`/services/${subscriptionId}/hosting-domains`);
}

/** F-01 — rekordy strefy DNS domeny z konta (DirectAdmin). */
export async function fetchHostingDnsAction(
  subscriptionId: string,
  domain: string,
): Promise<HostingDnsRecordsResponseDto> {
  return apiFetch<HostingDnsRecordsResponseDto>(
    `/services/${subscriptionId}/hosting-dns?domain=${encodeURIComponent(domain)}`,
  );
}
