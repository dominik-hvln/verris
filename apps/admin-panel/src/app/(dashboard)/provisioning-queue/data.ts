import { adminApi } from "@/lib/api";

export interface ProvisioningJobRow {
  id: string;
  name: string;
  state: string;
  timestamp: number;
  attemptsMade: number;
  finishedOn: number | null;
  processedOn: number | null;
  failedReason: string | null;
  failedCategory: "transient" | "permanent" | null;
  data: {
    type: "wallet" | "manual" | "stripe";
    subscriptionId: string;
    userId: string;
    domain: string;
    preferredRegion: string | null;
  };
  subscription: {
    status: string;
    provisioningStage: string | null;
    provisioningAttempts: number;
    provisioningLastError: string | null;
    user: { email: string; firstName: string | null; lastName: string | null };
    account: { id: string; daUsername: string; serverId: string } | null;
  } | null;
}

export interface ProvisioningQueueResponse {
  async: boolean;
  message?: string;
  counts: Record<string, number>;
  rows: ProvisioningJobRow[];
}

export async function listProvisioningQueue(state?: string): Promise<ProvisioningQueueResponse> {
  const qs = state ? `?state=${encodeURIComponent(state)}` : "";
  return adminApi<ProvisioningQueueResponse>(`/admin/provisioning-queue${qs}`);
}
