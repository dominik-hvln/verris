"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export async function retryProvisioningJob(
  jobId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi<{ ok: boolean }>(`/admin/provisioning-queue/${encodeURIComponent(jobId)}/retry`, {
      method: "POST",
      body: { reason },
    });
    revalidatePath("/provisioning-queue");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AdminApiError ? err.message : "Nie udało się ponowić joba.",
    };
  }
}
