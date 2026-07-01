"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";
import type { PartnerConfig } from "./data";

type Result = { ok: true } | { ok: false; error: string };
function msg(e: unknown): string {
  return e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Błąd";
}

export async function updatePartnerConfigAction(input: PartnerConfig): Promise<Result> {
  try {
    await adminApi("/admin/partners/config", { method: "PUT", body: JSON.stringify(input) });
    revalidatePath("/partners");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function processPayoutAction(
  id: string,
  action: "PAID" | "REJECTED",
  note?: string,
): Promise<Result> {
  try {
    await adminApi(`/admin/partners/payouts/${id}/process`, {
      method: "POST",
      body: JSON.stringify({ action, note }),
    });
    revalidatePath("/partners");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
