"use server";

import { revalidatePath } from "next/cache";
import { AdminApiError, adminApi } from "@/lib/api";

/** K3 — limity indywidualne usługi (apps/api/src/subscriptions/limity-indywidualne.admin.controller.ts), tylko ADMIN. */
export type WynikLimitow = { ok: true; komunikat: string } | { ok: false; error: string };

export async function zapiszLimityAction(
  subscriptionId: string,
  dane: { limity: Record<string, number | null> | null; powod: string; zgloszenie?: string },
): Promise<WynikLimitow> {
  const baza = `/admin/subscriptions/${encodeURIComponent(subscriptionId)}/limity`;
  const body: Record<string, unknown> = { powod: dane.powod.trim() };
  if (dane.zgloszenie?.trim()) body.zgloszenie = dane.zgloszenie.trim();
  if (dane.limity) body.limity = dane.limity;
  try {
    const r = await adminApi<{ komunikat?: string }>(dane.limity ? baza : `${baza}/przywroc`, { method: "POST", body });
    revalidatePath(`/subscriptions/${subscriptionId}`);
    return { ok: true, komunikat: r?.komunikat ?? "Zapisano." };
  } catch (e) {
    if (e instanceof AdminApiError && e.status === 403) return { ok: false, error: "Limity indywidualne ustawia administrator." };
    return { ok: false, error: e instanceof Error ? e.message : "Nie udało się." };
  }
}
