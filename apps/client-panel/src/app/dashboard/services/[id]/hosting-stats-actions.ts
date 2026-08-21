'use server';

import { apiFetch } from '@/lib/api';

export type HostingStats = {
  bandwidth: { usedMb: number; limitMb: number | null };
  disk: { usedMb: number; limitMb: number | null };
  counts: { domains: number; subdomains: number; emails: number; databases: number; ftp: number };
  fetchError: string | null;
};

export async function fetchHostingStatsAction(subscriptionId: string): Promise<HostingStats> {
  return apiFetch(`/services/${subscriptionId}/hosting-stats`);
}
