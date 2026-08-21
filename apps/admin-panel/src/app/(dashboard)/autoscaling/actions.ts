"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export type AutoscalingCatalogResource = "CPU" | "RAM" | "DISK";

/** Legacy values may still exist in DB until migrated off. */
export type AutoscalingResource = AutoscalingCatalogResource | "IO" | "TRANSFER";

export interface PriceRuleDto {
  id: string;
  resource: AutoscalingResource;
  unit: string;
  pricePerUnit: string;
  currency: string;
  thresholdAbove: number;
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreatePriceRuleInput {
  resource: AutoscalingCatalogResource;
  pricePerUnit: number;
  currency?: string;
  thresholdAbove?: number;
  isActive?: boolean;
  notes?: string;
}

export interface UpdatePriceRuleInput {
  pricePerUnit?: number;
  thresholdAbove?: number;
  isActive?: boolean;
  notes?: string | null;
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function listPriceRules(): Promise<ActionResult<PriceRuleDto[]>> {
  try {
    const data = await adminApi<PriceRuleDto[]>("/admin/autoscaling/pricing");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function createPriceRule(
  input: CreatePriceRuleInput,
): Promise<ActionResult<PriceRuleDto>> {
  try {
    const data = await adminApi<PriceRuleDto>("/admin/autoscaling/pricing", {
      method: "POST",
      body: input,
    });
    revalidatePath("/autoscaling");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updatePriceRule(
  id: string,
  input: UpdatePriceRuleInput,
): Promise<ActionResult<PriceRuleDto>> {
  try {
    const data = await adminApi<PriceRuleDto>(`/admin/autoscaling/pricing/${id}`, {
      method: "PATCH",
      body: input,
    });
    revalidatePath("/autoscaling");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function simulatePricingAction(input: {
  cpuPercent?: number;
  ramGb?: number;
  diskGb?: number;
  draftResource?: AutoscalingCatalogResource;
  draftPricePerUnit?: number;
  draftThresholdAbove?: number;
}): Promise<
  ActionResult<{
    currency: string;
    breakdown: {
      cpuHourly: string;
      ramHourly: string;
      diskHourly: string;
      totalHourly: string;
    };
    monthly: string;
  }>
> {
  try {
    const data = await adminApi('/admin/autoscaling/pricing/simulate', {
      method: 'POST',
      body: input,
    });
    return { ok: true, data: data as never };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function getAutoscalingRevenueReport(): Promise<
  ActionResult<{
    periodDays: number;
    currency: string;
    chargeCount: number;
    totalRevenue: string;
    byResource: { cpu: string; ram: string; disk: string; unallocatedLegacy: string };
    scaleEvents: { resource: string | null; direction: string; count: number }[];
  }>
> {
  try {
    const data = await adminApi('/admin/autoscaling/pricing/revenue');
    return { ok: true, data: data as never };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deactivatePriceRule(id: string): Promise<ActionResult> {
  try {
    await adminApi(`/admin/autoscaling/pricing/${id}`, { method: "DELETE" });
    revalidatePath("/autoscaling");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
