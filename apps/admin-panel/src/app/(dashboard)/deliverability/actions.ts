"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface CordonRow {
  userId: string;
  reason: string;
  at: string;
  email: string | null;
  name: string | null;
}

export async function listCordons(): Promise<{ ok: true; rows: CordonRow[] } | { ok: false; error: string }> {
  try {
    const res = await adminApi<{ cordons: CordonRow[] }>("/admin/deliverability/cordons");
    return { ok: true, rows: res.cordons };
  } catch (e) {
    return { ok: false, error: e instanceof AdminApiError || e instanceof Error ? e.message : "Nie udało się pobrać blokad." };
  }
}

/** N-14 — zdjęcie blokady wysyłki (tylko ADMIN; zapisane w audycie po stronie API). */
export async function releaseCordon(userId: string): Promise<{ ok: true } | { error: string }> {
  try {
    await adminApi("/admin/deliverability/cordons/release", { method: "POST", body: { userId } });
    revalidatePath("/deliverability");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof AdminApiError || e instanceof Error ? e.message : "Nie udało się zdjąć blokady." };
  }
}
