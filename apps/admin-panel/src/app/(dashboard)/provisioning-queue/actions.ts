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

// X-32 — odrzuć martwego joba z kolejki.
//
// Sprząta WYŁĄCZNIE wpis w kolejce. Subskrypcji nie dotyka — los zamówienia to
// osobna decyzja i osobna operacja. API przyjmie to tylko dla jobów w stanie
// `failed`; przy pozostałych odpowie wyjaśnieniem, które pokazujemy wprost.
export async function odrzucProvisioningJob(
  jobId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi<{ ok: boolean }>(
      `/admin/provisioning-queue/${encodeURIComponent(jobId)}/odrzuc`,
      { method: "POST", body: { reason } },
    );
    revalidatePath("/provisioning-queue");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AdminApiError ? err.message : "Nie udało się odrzucić joba.",
    };
  }
}

// #13 — ponów nieudaną operację węzła (NodeTask FAILED → QUEUED).
export async function retryNodeTask(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi<{ ok: boolean }>(
      `/admin/servers/node-tasks/${encodeURIComponent(taskId)}/retry`,
      { method: "POST" },
    );
    revalidatePath("/provisioning-queue");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AdminApiError ? err.message : "Nie udało się ponowić operacji.",
    };
  }
}
