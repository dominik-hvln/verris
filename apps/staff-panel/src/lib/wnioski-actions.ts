"use server";

import { revalidatePath } from "next/cache";
import { StaffApiError, staffApi } from "./staff-api";

/**
 * PB-48 — wnioski o operację wymagającą wyższego uprawnienia (API `admin/wnioski`).
 * Panel nie liczy uprawnień sam: o tym, czy trzeba wniosku, decyduje API (403 z code 'WYMAGA_WNIOSKU',
 * 400 z code 'WYKONAJ_BEZPOSREDNIO'); `/staff/me/access` służy tylko do wyglądu przycisków.
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

/** Wynik operacji z karty klienta: wykonana, wymaga wniosku (brak uprawnienia) albo błąd. */
export type WynikOperacji = { ok: true; komunikat: string } | { ok: false; wymagaWniosku: boolean; error: string };

function kodBledu(err: unknown): string | null {
  if (!(err instanceof StaffApiError) || !err.body || typeof err.body !== "object") return null;
  const c = (err.body as { code?: unknown }).code;
  return typeof c === "string" ? c : null;
}

function wynikBledu(err: unknown, domyslny: string): WynikOperacji {
  if (err instanceof StaffApiError) {
    return { ok: false, wymagaWniosku: err.status === 403 && kodBledu(err) === "WYMAGA_WNIOSKU", error: err.message };
  }
  return { ok: false, wymagaWniosku: false, error: domyslny };
}

/** Bezpośrednie wykonanie (operator z uprawnieniem) — te same endpointy co w panelu admina. */
export async function wykonajOperacjeAction(typ: TypWniosku, userId: string, payload: Record<string, unknown>): Promise<WynikOperacji> {
  try {
    if (typ === "CUSTOMER_INTERNAL_FLAG") {
      await staffApi(`/admin/users/${encodeURIComponent(userId)}/operational`, { method: "PATCH", body: { isInternal: payload.isInternal === true } });
    } else if (typ === "WALLET_CREDIT") {
      await staffApi(`/admin/billing/wallet/credit`, {
        method: "POST",
        body: { userId, amount: Number(payload.amount), description: payload.description || undefined, idempotencyKey: `staff-credit:${userId}:${Date.now()}` },
      });
    } else {
      await staffApi(`/admin/invoices/${encodeURIComponent(String(payload.invoiceId))}/anuluj`, { method: "POST", body: { powod: payload.powod } });
    }
  } catch (err) {
    return wynikBledu(err, "Nie udało się wykonać operacji.");
  }
  revalidatePath(`/crm/${userId}`);
  return { ok: true, komunikat: "Zrobione." };
}

export async function zlozWniosekAction(input: {
  typ: TypWniosku;
  userId: string;
  payload: Record<string, unknown>;
  uzasadnienie: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.uzasadnienie.trim().length < 5) return { ok: false, error: "Napisz uzasadnienie (min. 5 znaków)." };
  try {
    await staffApi(`/admin/wnioski`, {
      method: "POST",
      body: { typ: input.typ, userId: input.userId, payload: input.payload, uzasadnienie: input.uzasadnienie.trim() },
    });
  } catch (err) {
    return { ok: false, error: err instanceof StaffApiError ? err.message : "Nie udało się wysłać wniosku." };
  }
  revalidatePath("/wnioski");
  return { ok: true };
}

async function decyzja(sciezka: string, body: object): Promise<{ ok: true; wniosek: Wniosek } | { ok: false; error: string }> {
  try {
    const wniosek = await staffApi<Wniosek>(sciezka, { method: "POST", body });
    revalidatePath("/wnioski");
    return { ok: true, wniosek };
  } catch (err) {
    return { ok: false, error: err instanceof StaffApiError ? err.message : "Nie udało się zapisać decyzji." };
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
