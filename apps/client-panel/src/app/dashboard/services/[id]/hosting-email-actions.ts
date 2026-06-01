'use server';

import type { HostingEmailAccountsResponseDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchHostingEmailAction(
  subscriptionId: string,
): Promise<HostingEmailAccountsResponseDto> {
  return apiFetch<HostingEmailAccountsResponseDto>(`/services/${subscriptionId}/hosting-email`);
}
