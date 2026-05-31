"use server";

import { revalidatePath } from "next/cache";
import type {
  ServerSummaryDto,
  InitServerInput,
  InitServerResponseDto,
  BootstrapScriptResponseDto,
  UpdateDirectAdminConfigInput,
  DirectAdminTestResultDto,
  NodeTaskDto,
  QueueHostingProfileTaskInput,
  TasksAgentInstallScriptDto,
  NodeAuditReportDto,
  NodeRepairResultDto,
  NodeNameserversDto,
  UpdateNameserversInput,
} from "@verris/contracts";
import { adminApi, AdminApiError } from "@/lib/api";

export async function fetchServers() {
  try {
    return { data: await adminApi<ServerSummaryDto[]>("/admin/servers") };
  } catch (err) {
    return { data: [] as ServerSummaryDto[], error: extractError(err) };
  }
}

export async function fetchServer(id: string) {
  try {
    return { data: await adminApi<ServerSummaryDto>(`/admin/servers/${id}`) };
  } catch (err) {
    return { data: null, error: extractError(err) };
  }
}

export async function initServer(input: InitServerInput) {
  try {
    const data = await adminApi<InitServerResponseDto>("/admin/servers", {
      method: "POST",
      body: input,
    });
    revalidatePath("/nodes");
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function generateBootstrapScript(id: string) {
  try {
    const data = await adminApi<BootstrapScriptResponseDto>(
      `/admin/servers/${id}/bootstrap-script`,
      { method: "POST" },
    );
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function approveServer(id: string) {
  try {
    const data = await adminApi<ServerSummaryDto>(`/admin/servers/${id}/approve`, {
      method: "POST",
    });
    revalidatePath("/nodes");
    revalidatePath(`/nodes/${id}`);
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function updateDirectAdminConfig(id: string, input: UpdateDirectAdminConfigInput) {
  try {
    const data = await adminApi<ServerSummaryDto>(`/admin/servers/${id}/directadmin`, {
      method: "PATCH",
      body: input,
    });
    revalidatePath(`/nodes/${id}`);
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function testDirectAdmin(id: string) {
  try {
    const data = await adminApi<DirectAdminTestResultDto>(
      `/admin/servers/${id}/directadmin/test`,
      { method: "POST" },
    );
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function setNodeMaintenance(
  id: string,
  enable: boolean,
  reason?: string,
) {
  try {
    const data = await adminApi<ServerSummaryDto>(
      `/admin/servers/${id}/maintenance`,
      {
        method: "POST",
        body: { enable, reason },
      },
    );
    revalidatePath("/nodes");
    revalidatePath(`/nodes/${id}`);
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function queueHostingProfile(
  id: string,
  input: QueueHostingProfileTaskInput = {},
) {
  try {
    const data = await adminApi<NodeTaskDto>(`/admin/servers/${id}/hosting-profile/run`, {
      method: "POST",
      body: input,
    });
    revalidatePath(`/nodes/${id}`);
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function fetchHostingProfileTasks(id: string) {
  try {
    const data = await adminApi<NodeTaskDto[]>(`/admin/servers/${id}/hosting-profile/tasks`);
    return { data };
  } catch (err) {
    return { error: extractError(err), data: [] as NodeTaskDto[] };
  }
}

export async function fetchTasksAgentInstallScript(id: string) {
  try {
    const data = await adminApi<TasksAgentInstallScriptDto>(
      `/admin/servers/${id}/tasks-agent/install-script`,
    );
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function fetchNodeAudit(id: string) {
  try {
    const data = await adminApi<NodeAuditReportDto>(`/admin/servers/${id}/audit`);
    return { data };
  } catch (err) {
    return { error: extractError(err), data: null };
  }
}

export async function fetchNodeNameservers(id: string) {
  try {
    return { data: await adminApi<NodeNameserversDto>(`/admin/servers/${id}/nameservers`) };
  } catch (err) {
    return { data: null, error: extractError(err) };
  }
}

export async function updateNodeNameservers(id: string, input: UpdateNameserversInput) {
  try {
    const data = await adminApi<NodeNameserversDto>(`/admin/servers/${id}/nameservers`, {
      method: "PATCH",
      body: input,
    });
    revalidatePath(`/nodes/${id}`);
    return { data };
  } catch (err) {
    return { data: null, error: extractError(err) };
  }
}

export interface NsProvisionStepDto {
  step: string;
  status: "created" | "updated" | "unchanged" | "skipped" | "error";
  detail?: string;
}

export interface NsProvisionResultDto {
  ns1: string;
  ns2: string;
  ipv4: string;
  ipv6: string | null;
  baseDomain: string;
  steps: NsProvisionStepDto[];
  ok: boolean;
}

export async function fetchNodeDnsStatus() {
  try {
    return {
      data: await adminApi<{ ovhConfigured: boolean }>(`/admin/servers/dns/status`),
    };
  } catch (err) {
    return { data: null, error: extractError(err) };
  }
}

export async function provisionNodeNameservers(id: string, ipv6?: string) {
  try {
    const data = await adminApi<NsProvisionResultDto>(
      `/admin/servers/${id}/nameservers/provision`,
      { method: "POST", body: ipv6 ? { ipv6 } : {} },
    );
    revalidatePath(`/nodes/${id}`);
    return { data };
  } catch (err) {
    return { data: null, error: extractError(err) };
  }
}

export interface NodeAccountRow {
  id: string;
  daUsername: string;
  domain: string;
  status: string;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  scaledCpu: number;
  scaledRamMb: number;
  scaledDiskMb: number;
  subscriptionId: string;
  subscriptionStatus: string | null;
  planName: string | null;
  ownerEmail: string | null;
  latest: null | {
    bucketStart: string;
    cpuUsageAvg: number;
    memUsageAvgMb: number;
    diskUsageMb: number;
    ioUsageKbps: number;
  };
}

export interface NodeAccountsResponse {
  serverId: string;
  count: number;
  accounts: NodeAccountRow[];
}

export interface NodeUsageResponse {
  window: string;
  server: {
    id: string;
    name: string | null;
    ipAddress: string | null;
    hostname: string | null;
    totalCpuCores: number | null;
    totalMemoryMb: number | null;
    totalDiskMb: number | null;
    allocatedCpu: number;
    allocatedMemory: number;
    allocatedDisk: number;
  };
  accountCount: number;
  activeAccountCount: number;
  scaledTotals: { cpu: number; ramMb: number; diskMb: number };
  series: Array<{
    bucketStart: string;
    cpuUsageAvg: number;
    memUsageAvgMb: number;
    diskUsageMb: number;
    ioUsageKbps: number;
  }>;
  latest: null | {
    bucketStart: string;
    cpuUsageAvg: number;
    memUsageAvgMb: number;
    diskUsageMb: number;
    ioUsageKbps: number;
  };
}

export async function fetchNodeAccounts(id: string): Promise<NodeAccountsResponse> {
  return adminApi<NodeAccountsResponse>(`/admin/servers/${id}/accounts`);
}

export async function fetchNodeUsage(
  id: string,
  window: "24h" | "7d" = "24h",
): Promise<NodeUsageResponse> {
  return adminApi<NodeUsageResponse>(`/admin/servers/${id}/usage?window=${window}`);
}

export async function repairNode(id: string, actionId: string, confirm?: string) {
  try {
    const data = await adminApi<NodeRepairResultDto>(
      `/admin/servers/${id}/repair/${actionId}`,
      { method: "POST", body: { confirm } },
    );
    revalidatePath(`/nodes/${id}`);
    return { data };
  } catch (err) {
    return { error: extractError(err), data: null };
  }
}

function extractError(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Nieznany błąd serwera";
}
