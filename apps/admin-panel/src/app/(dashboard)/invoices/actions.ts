"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

/** M-08 — anulowanie nieopłaconego dokumentu (opłacony zmienia się korektą). */
export async function anulujDokument(
  invoiceId: string,
  powod: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi(`/admin/invoices/${encodeURIComponent(invoiceId)}/anuluj`, { method: "POST", body: { powod } });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof AdminApiError ? err.message : "Nie udało się anulować dokumentu." };
  }
}

/** Ponowienie wysyłki odrzuconej faktury do KSeF (tylko ADMIN; wcześniej w „Danych firmy”). */
export async function ponowKsef(invoiceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi(`/admin/ksef/invoices/${encodeURIComponent(invoiceId)}/retry`, { method: "POST" });
    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof AdminApiError ? err.message : "Nie udało się ponowić wysyłki do KSeF." };
  }
}
