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
  stripePriceMonthlyId?: string;
  stripePriceYearlyId?: string;
  autoscalingMaxOverscaleCpu?: number;
  autoscalingMaxOverscaleRam?: number;
  autoscalingMaxOverscaleDisk?: number;
}

export async function createPlanAction(payload: CreatePlanPayload): Promise<PlanActionResult> {
  try {
    await adminApi(`/admin/plans`, { method: "POST", body: payload });
    revalidatePath("/plans");
    return { ok: true, message: "Plan utworzony." };
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
