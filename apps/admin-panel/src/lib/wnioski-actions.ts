"use server";

import { revalidatePath } from "next/cache";
import { AdminApiError, adminApi } from "./api";

/**
 * PB-48 — wnioski o operację wymagającą wyższego uprawnienia (API `admin/wnioski`).
 * Panel admina: wniosek z przełącznika „konto wewnętrzne” (PB-47) i strona „Wnioski” (decyzje, historia).
 * Ten sam kontrakt co w panelu obsługi (apps/staff-panel/src/lib/wnioski-actions.ts).
 */

export type TypWniosku = "CUSTOMER_INTERNAL_FLAG" | "WALLET_CREDIT" | "INVOICE_VOID";

export interface Wniosek {
  id: string;
  typ: string;
  etykieta: string;
  opis: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "FAILED";
  uzasadnienie: string;
  klient: { id: string; email: string; nazwa: string | null } | null;
  wnioskujacy: { id: string; nazwa: string | null };
  decydujacy: { id: string; nazwa: string | null } | null;
  powodDecyzji: string | null;
  wynik: { komunikat?: string; blad?: string; bezZmian?: boolean } | null;
  utworzono: string;
  rozstrzygnieto: string | null;
}

export async function zlozWniosekAction(input: {
  typ: TypWniosku;
  userId: string;
  payload: Record<string, unknown>;
  uzasadnienie: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.uzasadnienie.trim().length < 5) return { ok: false, error: "Napisz uzasadnienie (min. 5 znaków)." };
  try {
    await adminApi(`/admin/wnioski`, {
      method: "POST",
      body: { typ: input.typ, userId: input.userId, payload: input.payload, uzasadnienie: input.uzasadnienie.trim() },
    });
  } catch (err) {
    return { ok: false, error: err instanceof AdminApiError ? err.message : "Nie udało się wysłać wniosku." };
  }
  revalidatePath("/wnioski");
  revalidatePath(`/customers/${input.userId}`);
  return { ok: true };
}

async function decyzja(sciezka: string, body: object): Promise<{ ok: true; wniosek: Wniosek } | { ok: false; error: string }> {
  try {
    const wniosek = await adminApi<Wniosek>(sciezka, { method: "POST", body });
    revalidatePath("/wnioski");
    return { ok: true, wniosek };
  } catch (err) {
    return { ok: false, error: err instanceof AdminApiError ? err.message : "Nie udało się zapisać decyzji." };
  }
}

export async function akceptujWniosekAction(id: string) {
  return decyzja(`/admin/wnioski/${encodeURIComponent(id)}/akceptuj`, {});
}

export async function odrzucWniosekAction(id: string, powod: string) {
  if (powod.trim().length < 3) return { ok: false as const, error: "Podaj powód odrzucenia (min. 3 znaki)." };
  return decyzja(`/admin/wnioski/${encodeURIComponent(id)}/odrzuc`, { powod: powod.trim() });
}

export async function anulujWniosekAction(id: string) {
  return decyzja(`/admin/wnioski/${encodeURIComponent(id)}/anuluj`, {});
}
