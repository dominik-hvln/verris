"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

/** F3.8 (ON-03) — mail do klienta z szablonu (apps/api/src/komunikacja: POST admin/users/:id/mail-obslugi). */
export async function wyslijMailObslugiAction(
  userId: string,
  dane: { szablon: string; temat: string; tresc: string; zgloszenie?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const zgloszenie = (dane.zgloszenie ?? "").trim();
  try {
    await adminApi(`/admin/users/${encodeURIComponent(userId)}/mail-obslugi`, {
      method: "POST",
      body: { szablon: dane.szablon, temat: dane.temat.trim(), tresc: dane.tresc.trim(), ...(zgloszenie ? { zgloszenie } : {}) },
    });
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
      return { ok: false, error: "Twoja rola nie może pisać do klientów (wymaga CUSTOMERS_VIEW i TICKETS_MANAGE)." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Nie udało się wysłać maila." };
  }
  revalidatePath(`/customers/${userId}`);
  return { ok: true };
}
