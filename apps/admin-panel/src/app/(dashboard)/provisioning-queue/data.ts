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

// #13 — operacje węzłów (NodeTask)
export interface NodeTaskRow {
  id: string;
  kind: string;
  status: string;
  serverId: string;
  serverName: string;
  accountDomain: string | null;
  requestedByEmail: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export async function listNodeTasks(status?: string): Promise<NodeTaskRow[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return adminApi<NodeTaskRow[]>(`/admin/servers/node-tasks${qs}`);
}
