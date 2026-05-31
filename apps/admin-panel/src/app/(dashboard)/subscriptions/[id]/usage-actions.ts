"use server";

import { adminApi } from "@/lib/api";

export interface AdminServiceUsage {
  window: string;
  account: null | {
    daUsername: string;
    domain: string;
    status: string;
    serverId: string;
    cpuLimit: number;
    ramLimitMb: number;
    diskLimitMb: number;
    ioLimitKbps: number;
    iopsLimit: number;
    entryProcesses: number;
    nprocLimit: number;
    scaledCpu: number;
    scaledRamMb: number;
    scaledDiskMb: number;
  };
  latest: null | {
    bucketStart: string;
    cpuUsageAvg: number;
    cpuUsageMax: number;
    memUsageAvgMb: number;
    memUsageMaxMb: number;
    diskUsageMb: number;
    ioUsageKbps: number;
  };
  rows: Array<{
    bucketStart: string;
    cpuUsageAvg: number;
    memUsageAvgMb: number;
    diskUsageMb: number;
    ioUsageKbps: number;
  }>;
}

export async function fetchSubscriptionUsageAction(
  subscriptionId: string,
  window: "24h" | "7d" = "24h",
): Promise<AdminServiceUsage> {
  return adminApi<AdminServiceUsage>(`/admin/subscriptions/${subscriptionId}/usage?window=${window}`);
}
