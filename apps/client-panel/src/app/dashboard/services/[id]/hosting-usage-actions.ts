'use server';

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

export async function fetchHostingUsageAction(
  serviceId: string,
  window: '24h' | '7d',
): Promise<HostingUsageResponse> {
  return apiFetch<HostingUsageResponse>(`/services/${serviceId}/usage?window=${window}`);
}
