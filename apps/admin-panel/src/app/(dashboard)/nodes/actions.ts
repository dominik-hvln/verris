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

function extractError(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Nieznany błąd serwera";
}
