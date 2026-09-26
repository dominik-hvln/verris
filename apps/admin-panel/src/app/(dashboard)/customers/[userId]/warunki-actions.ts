"use server";

import { adminApi, AdminApiError } from "@/lib/api";

type Wynik = { ok: true } | { ok: false; error: string };

async function wywolaj(path: string, method: "POST" | "PATCH", body: object): Promise<Wynik> {
  try {
    await adminApi(path, { method, body });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof AdminApiError ? e.message : "Nie udało się zapisać — spróbuj ponownie." };
  }
}

/** PB-27 / PB-28 — akcje sekcji „Indywidualne warunki i rozliczenie”. */
export async function zalozUsluge(userId: string, dto: Record<string, unknown>) {
  return wywolaj(`/admin/custom-terms/user/${encodeURIComponent(userId)}/service`, "POST", dto);
}
export async function ustawWarunki(subscriptionId: string, dto: Record<string, unknown>) {
  return wywolaj(`/admin/custom-terms/subscription/${encodeURIComponent(subscriptionId)}`, "PATCH", dto);
}
export async function rozliczeniePoza(userId: string, dto: { wlaczone: boolean; powod: string }) {
  return wywolaj(`/admin/custom-terms/user/${encodeURIComponent(userId)}/billing-outside`, "PATCH", dto);
}
