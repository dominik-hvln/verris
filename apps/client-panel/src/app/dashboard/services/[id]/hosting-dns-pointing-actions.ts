'use server';

import type { HostingDnsPointingDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchDomainPointingAction(
  serviceId: string,
): Promise<HostingDnsPointingDto> {
  return apiFetch<HostingDnsPointingDto>(`/services/${serviceId}/hosting-domain-pointing`);
}

export async function verifyDomainPointingAction(
  serviceId: string,
): Promise<HostingDnsPointingDto> {
  return apiFetch<HostingDnsPointingDto>(`/services/${serviceId}/hosting-domain-pointing/verify`, {
    method: 'POST',
  });
}
