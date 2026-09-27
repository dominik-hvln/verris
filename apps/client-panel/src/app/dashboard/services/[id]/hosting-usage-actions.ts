'use server';

import { bezpiecznie, type Wynik as WynikAkcji } from '@/lib/wynik-akcji';

import { apiFetch } from '@/lib/api';

export interface HostingUsageResponse {
  window: string;
  rows: Array<{
    bucketStart: string;
    cpuUsageAvg: number;
    cpuUsageMax: number;
    memUsageAvgMb: number;
    memUsageMaxMb: number;
    diskUsageMb: number;
    ioUsageKbps: number;
  }>;
}

async function fetchHostingUsageActionTresc(
  serviceId: string,
  window: '24h' | '7d',
): Promise<HostingUsageResponse> {
  return apiFetch<HostingUsageResponse>(`/services/${serviceId}/usage?window=${window}`);
}

export async function fetchHostingUsageAction(...a: Parameters<typeof fetchHostingUsageActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchHostingUsageActionTresc>>>> {
  return bezpiecznie(() => fetchHostingUsageActionTresc(...a));
}
