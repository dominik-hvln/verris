'use server';

import { bezpiecznie, type Wynik as WynikAkcji } from '@/lib/wynik-akcji';

import type { HostingDnsRecordsResponseDto, HostingDomainsResponseDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

async function fetchHostingDomainsActionTresc(
  subscriptionId: string,
): Promise<HostingDomainsResponseDto> {
  return apiFetch<HostingDomainsResponseDto>(`/services/${subscriptionId}/hosting-domains`);
}

/** F-01 — rekordy strefy DNS domeny z konta (DirectAdmin). */
async function fetchHostingDnsActionTresc(
  subscriptionId: string,
  domain: string,
): Promise<HostingDnsRecordsResponseDto> {
  return apiFetch<HostingDnsRecordsResponseDto>(
    `/services/${subscriptionId}/hosting-dns?domain=${encodeURIComponent(domain)}`,
  );
}

export async function fetchHostingDomainsAction(...a: Parameters<typeof fetchHostingDomainsActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchHostingDomainsActionTresc>>>> {
  return bezpiecznie(() => fetchHostingDomainsActionTresc(...a));
}

export async function fetchHostingDnsAction(...a: Parameters<typeof fetchHostingDnsActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchHostingDnsActionTresc>>>> {
  return bezpiecznie(() => fetchHostingDnsActionTresc(...a));
}
