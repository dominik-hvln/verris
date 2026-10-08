"use server";

import { revalidatePath } from "next/cache";
import { StaffApiError, staffApi } from "@/lib/staff-api";

export type WynikOperacji = { ok: true } | { ok: false; error: string };

const BRAK_ZARZADZANIA =
  "Twoja rola nie ma uprawnienia „Zarządzanie klientami (edycja, blokady)”. Poproś administratora o jego nadanie.";

/**
 * PB-46 — zapis notatki wewnętrznej i blokady logowania z karty klienta w panelu obsługi. Ten sam endpoint co
 * w panelu admina (`PATCH /admin/users/:id/operational`, CUSTOMERS_MANAGE, wpis w dzienniku po stronie API).
 * Wysyłamy wyłącznie pola danej operacji — zapis notatki nie rusza blokady i odwrotnie.
 */
async function patch(userId: string, body: Record<string, unknown>): Promise<WynikOperacji> {
  try {
    await staffApi(`/admin/users/${encodeURIComponent(userId)}/operational`, { method: "PATCH", body });
  } catch (err) {
    if (err instanceof StaffApiError) return { ok: false, error: err.status === 403 ? BRAK_ZARZADZANIA : err.message };
    return { ok: false, error: "Nie udało się zapisać zmian." };
  }
  revalidatePath(`/crm/${userId}`);
  return { ok: true };
}

export async function zapiszNotatkeAction(userId: string, notatka: string): Promise<WynikOperacji> {
  return patch(userId, { adminInternalNote: notatka.trim() || null });
}

export async function ustawBlokadeAction(userId: string, zablokowane: boolean, powod: string): Promise<WynikOperacji> {
  return patch(userId, { loginBlocked: zablokowane, loginBlockedReason: zablokowane ? powod.trim() || null : null });
}
