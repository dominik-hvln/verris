"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

/**
 * FAK-01 — dopisanie numeru faktury VAT z programu księgowego.
 * Raz: zmiana dopisanego numeru to korekta w programie, nie edycja tutaj.
 */
export async function dopiszFaktureZewnetrzna(
  invoiceId: string,
  numer: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi(`/admin/invoices/${encodeURIComponent(invoiceId)}/faktura-zewnetrzna`, {
      method: "POST",
      body: { numer: numer.trim() },
    });
    revalidatePath("/invoices/czeka-na-fakture");
    revalidatePath("/invoices");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AdminApiError ? err.message : "Nie udało się zapisać numeru faktury.",
    };
  }
}
