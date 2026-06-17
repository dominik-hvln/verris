"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface VpsPlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  hetznerServerType: string;
  hetznerImage: string;
  location: string;
  vcpu: number;
  ramGb: number;
  diskGb: number;
  trafficTb: number;
  priceMonthly: string;
  currency: string;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface HetznerServerType {
  name: string;
  cores: number;
  memory: number;
  disk: number;
}

export interface VpsPlanInput {
  slug: string;
  name: string;
  description?: string;
  hetznerServerType: string;
  hetznerImage?: string;
  location?: string;
  vcpu: number;
  ramGb: number;
  diskGb: number;
  trafficTb?: number;
  priceMonthly: number;
  currency?: string;
  isPublic?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

function err(e: unknown): string {
  return e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Błąd";
}

export async function fetchVpsAvailability(): Promise<boolean> {
  try {
    const r = await adminApi<{ available: boolean }>("/admin/vps/availability");
    return r.available;
  } catch {
    return false;
  }
}

export async function fetchVpsPlans(): Promise<VpsPlanRow[]> {
  try {
    return await adminApi<VpsPlanRow[]>("/admin/vps/plans");
  } catch {
    return [];
  }
}

export async function fetchHetznerServerTypes(): Promise<HetznerServerType[]> {
  try {
    return await adminApi<HetznerServerType[]>("/admin/vps/server-types");
  } catch {
    return [];
  }
}

export async function createVpsPlan(input: VpsPlanInput): Promise<Result> {
  try {
    await adminApi("/admin/vps/plans", { method: "POST", body: input });
    revalidatePath("/vps");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function updateVpsPlan(id: string, input: Partial<VpsPlanInput>): Promise<Result> {
  try {
    await adminApi(`/admin/vps/plans/${id}`, { method: "PATCH", body: input });
    revalidatePath("/vps");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function disableVpsPlan(id: string): Promise<Result> {
  try {
    await adminApi(`/admin/vps/plans/${id}`, { method: "DELETE" });
    revalidatePath("/vps");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
