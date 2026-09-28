"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface PlanActionOk {
  ok: true;
  message?: string;
  data?: unknown;
}

export interface PlanActionErr {
  ok: false;
  error: string;
  status?: number;
}

export type PlanActionResult = PlanActionOk | PlanActionErr;

interface CreatePlanPayload {
  slug: string;
  name: string;
  description?: string;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  ioLimitKbps?: number;
  iopsLimit?: number;
  entryProcesses?: number;
  nprocLimit?: number;
  includedTransferGb?: number;
  priceMonthly: number;
  priceYearly: number;
  currency?: string;
  isPublic?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  trialDays?: number;
  productKind?: "HOSTING" | "EMAIL";
  supportSlaHours?: number;
  stripePriceMonthlyId?: string;
  stripePriceYearlyId?: string;
  autoscalingMaxOverscaleCpu?: number;
  autoscalingMaxOverscaleRam?: number;
  autoscalingMaxOverscaleDisk?: number;
}

export async function createPlanAction(payload: CreatePlanPayload): Promise<PlanActionResult> {
  try {
    const created = await adminApi<{ id: string }>(`/admin/plans`, { method: "POST", body: payload });
    revalidatePath("/plans");
    return { ok: true, message: "Plan utworzony.", data: created };
  } catch (e) {
    if (e instanceof AdminApiError) {
      return { ok: false, error: e.message, status: e.status };
    }
    return { ok: false, error: (e as Error).message };
  }
}

interface UpdatePlanPayload {
  name?: string;
  description?: string;
  cpuLimit?: number;
  ramLimitMb?: number;
  diskLimitMb?: number;
  ioLimitKbps?: number;
  iopsLimit?: number;
  entryProcesses?: number;
  nprocLimit?: number;
  includedTransferGb?: number;
  priceMonthly?: number;
  priceYearly?: number;
  isPublic?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  trialDays?: number;
  productKind?: "HOSTING" | "EMAIL";
  supportSlaHours?: number;
  stripePriceMonthlyId?: string;
  stripePriceYearlyId?: string;
  autoscalingMaxOverscaleCpu?: number;
  autoscalingMaxOverscaleRam?: number;
  autoscalingMaxOverscaleDisk?: number;
}

export async function updatePlanAction(
  id: string,
  payload: UpdatePlanPayload,
): Promise<PlanActionResult> {
  try {
    await adminApi(`/admin/plans/${id}`, { method: "PATCH", body: payload });
    revalidatePath("/plans");
    revalidatePath(`/plans/${id}`);
    return { ok: true, message: "Plan zapisany." };
  } catch (e) {
    if (e instanceof AdminApiError) {
      return { ok: false, error: e.message, status: e.status };
    }
    return { ok: false, error: (e as Error).message };
  }
}

export async function deactivatePlanAction(id: string): Promise<PlanActionResult> {
  try {
    await adminApi(`/admin/plans/${id}`, { method: "DELETE" });
    revalidatePath("/plans");
    return { ok: true, message: "Plan zdezaktywowany (brak publicznej sprzedaży)." };
  } catch (e) {
    if (e instanceof AdminApiError) {
      return { ok: false, error: e.message, status: e.status };
    }
    return { ok: false, error: (e as Error).message };
  }
}

export interface ValidatedStripePrice {
  ok: true;
  stripe: {
    id: string;
    currency: string;
    unitAmount: number | null;
    active: boolean;
    livemode: boolean;
    product: string;
    interval: string | null;
  };
}

export async function syncPlanStripeAction(id: string): Promise<PlanActionResult> {
  try {
    await adminApi(`/admin/plans/${id}/sync-stripe`, { method: "POST" });
    revalidatePath("/plans");
    revalidatePath(`/plans/${id}`);
    return { ok: true, message: "Plan zsynchronizowany ze Stripe." };
  } catch (e) {
    if (e instanceof AdminApiError) {
      return { ok: false, error: e.message, status: e.status };
    }
    return { ok: false, error: (e as Error).message };
  }
}

export async function validateStripePriceAction(input: {
  priceId: string;
  interval: "month" | "year";
  expectedAmount: number;
  expectedCurrency?: string;
}): Promise<PlanActionResult> {
  try {
    const data = await adminApi<ValidatedStripePrice>(
      `/admin/plans/validate-stripe-price`,
      { method: "POST", body: input },
    );
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AdminApiError) {
      return { ok: false, error: e.message, status: e.status };
    }
    return { ok: false, error: (e as Error).message };
  }
}

export interface PakietyFloty {
  wezly: Array<{ id: string; name: string; konta: number }>;
  konta: number;
}
export interface WynikSyncuFloty {
  wyniki: Array<{ id: string; name: string; ok: boolean; pakiety?: string[]; blad?: string }>;
}

/** Podgląd: ile kont tego planu na których węzłach dostanie nowe limity. */
export async function pobierzPakietyFlotyAction(planId: string): Promise<PlanActionResult & { dane?: PakietyFloty }> {
  try {
    const dane = await adminApi<PakietyFloty>(`/admin/servers/pakiety-floty?planId=${encodeURIComponent(planId)}`);
    return { ok: true, dane };
  } catch (e) {
    return { ok: false, error: e instanceof AdminApiError ? e.message : (e as Error).message };
  }
}

/** Pakiety DA wszystkich aktywnych planów → każdy węzeł z DA (po potwierdzeniu admina). */
export async function wyslijPakietyNaFloteAction(): Promise<PlanActionResult & { dane?: WynikSyncuFloty }> {
  try {
    const dane = await adminApi<WynikSyncuFloty>(`/admin/servers/pakiety-floty/sync`, { method: "POST" });
    return { ok: true, dane };
  } catch (e) {
    return { ok: false, error: e instanceof AdminApiError ? e.message : (e as Error).message };
  }
}

/** Trwałe usunięcie planu — API odmawia (409), gdy plan ma jakąkolwiek subskrypcję. */
export async function usunPlanTrwaleAction(id: string): Promise<PlanActionResult> {
  try {
    await adminApi(`/admin/plans/${id}/trwale`, { method: "DELETE" });
    revalidatePath("/plans");
    return { ok: true, message: "Plan usunięty." };
  } catch (e) {
    if (e instanceof AdminApiError) return { ok: false, error: e.message, status: e.status };
    return { ok: false, error: (e as Error).message };
  }
}
