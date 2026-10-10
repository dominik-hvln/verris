"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

/** F2.8 — ręczne uruchomienie zadania z białej listy (API: tylko ADMIN, przebieg w tle, wynik w rejestrze). */
export async function uruchomZadanie(klucz: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi(`/admin/zadania-w-tle/${encodeURIComponent(klucz)}/uruchom`, { method: "POST" });
    revalidatePath("/system/zadania");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof AdminApiError ? e.message : "Nie udało się — spróbuj ponownie." };
  }
}
