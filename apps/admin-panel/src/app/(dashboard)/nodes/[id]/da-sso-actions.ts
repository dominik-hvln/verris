"use server";

import { adminApi, AdminApiError } from "@/lib/api";

export interface NodeSsoResult {
  url: string;
  sshHost: string | null;
  sshCommand: string | null;
}

/** FALA-2c — jednorazowy adres logowania admina do DirectAdmin węzła (SSO). */
export async function createNodeSsoUrl(
  serverId: string,
): Promise<{ data: NodeSsoResult } | { error: string }> {
  try {
    return { data: await adminApi<NodeSsoResult>(`/admin/servers/${serverId}/sso-url`, { method: "POST" }) };
  } catch (err) {
    if (err instanceof AdminApiError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Nieznany błąd" };
  }
}
