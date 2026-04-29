"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export type AutoscalingResource = "CPU" | "RAM" | "IO" | "TRANSFER";

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
  resource: AutoscalingResource;
  unit: string;
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
  notes?: string;
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
