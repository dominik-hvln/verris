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

/** Tylko baner „Hetzner nie jest skonfigurowany” — przy błędzie lepiej go pokazać niż ukryć. */
export async function fetchVpsAvailability(): Promise<boolean> {
  try {
    const r = await adminApi<{ available: boolean }>("/admin/vps/availability");
    return r.available;
  } catch {
    return false;
  }
}

/** Fala 1B — błąd API leci do strony (komunikat z ponowieniem), nie udaje pustej listy planów. */
export async function fetchVpsPlans(): Promise<VpsPlanRow[]> {
  return adminApi<VpsPlanRow[]>("/admin/vps/plans");
}

/** Katalog typów służy tylko do podpowiedzi specyfikacji w formularzu — przy błędzie formularz działa bez nich. */
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

/** Q-08 — cena snapshotów VPS (K/GB/mies.; null = wyłączone) i limit na serwer. */
export interface VpsSnapshotSettings {
  pricePerGbMonthly: string | null;
  limit: number;
}

export async function fetchVpsSnapshotSettings(): Promise<VpsSnapshotSettings> {
  return adminApi<VpsSnapshotSettings>("/admin/vps/snapshot-settings");
}

export async function updateVpsSnapshotSettingsAction(
  _prev: { ok?: boolean; error?: string },
  form: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await adminApi("/admin/vps/snapshot-settings", {
      method: "PATCH",
      body: {
        pricePerGbMonthly: String(form.get("pricePerGbMonthly") ?? "").trim() || null,
        limit: Number(form.get("limit")),
      },
    });
    revalidatePath("/vps");
    return { ok: true };
  } catch (e) {
    return { error: err(e) };
  }
}
