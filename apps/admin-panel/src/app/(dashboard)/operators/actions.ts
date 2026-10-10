"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface ActionOk {
  ok: true;
  message?: string;
  data?: { canAccessGrafana?: boolean };
}
export interface ActionErr {
  ok: false;
  error: string;
  status?: number;
}
export type ActionResult = ActionOk | ActionErr;

export async function setGrafanaAccessAction(input: {
  userId: string;
  enabled: boolean;
  reason?: string;
}): Promise<ActionResult> {
  try {
    const data = await adminApi<{ ok: true; canAccessGrafana: boolean }>(
      `/admin/users/${input.userId}/grafana-access`,
      {
        method: "POST",
        body: { enabled: input.enabled, reason: input.reason },
      },
    );
    revalidatePath("/operators", "layout");
    revalidatePath(`/customers/${input.userId}`);
    return {
      ok: true,
      message: data.canAccessGrafana
        ? "Dostęp do Grafany włączony."
        : "Dostęp do Grafany wyłączony.",
      data: { canAccessGrafana: data.canAccessGrafana },
    };
  } catch (e) {
    if (e instanceof AdminApiError) {
      return { ok: false, error: e.message, status: e.status };
    }
    return { ok: false, error: (e as Error).message };
  }
}

/** D10 — stan wymogu 2FA zespołu (GET/PATCH admin/platform-settings/wymog-2fa, tylko ADMIN). */
export interface StanWymogu2fa {
  wlaczony: boolean;
  wymuszonyEnv: boolean;
  obowiazuje: boolean;
}

export async function ustawWymog2faAction(wlaczony: boolean): Promise<{ ok: true; stan: StanWymogu2fa } | ActionErr> {
  try {
    const stan = await adminApi<StanWymogu2fa>("/admin/platform-settings/wymog-2fa", { method: "PATCH", body: { wlaczony } });
    revalidatePath("/operators");
    return { ok: true, stan };
  } catch (e) {
    return { ok: false, error: e instanceof AdminApiError ? e.message : "Nie udało się zapisać ustawienia." };
  }
}
