"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export type WafMode = "OFF" | "DETECTION" | "ON";

export interface WafAccountRow {
  id: string;
  domain: string;
  daUsername: string;
  status: string;
  wafMode: WafMode;
  wafAppliedAt: string | null;
}

export interface WafOverview {
  serverId: string;
  accounts: WafAccountRow[];
}

export async function fetchWafOverview(serverId: string) {
  try {
    return { data: await adminApi<WafOverview>(`/admin/waf/servers/${serverId}`) };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function setAccountWafMode(serverId: string, accountId: string, mode: WafMode) {
  try {
    const data = await adminApi(`/admin/waf/accounts/${accountId}/mode`, {
      method: "POST",
      body: { mode },
    });
    revalidatePath(`/nodes/${serverId}`);
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

function extractError(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  return err instanceof Error ? err.message : "Nieznany błąd";
}
