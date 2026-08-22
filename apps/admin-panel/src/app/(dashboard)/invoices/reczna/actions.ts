"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface PozycjaWej {
  nazwa: string;
  ilosc: number;
  cenaBrutto: number;
}

/**
 * Z-01 — wystawienie faktury spoza automatu.
 *
 * Kwoty idą BRUTTO, tak jak w cenniku i w koszyku. Rozbicie na netto i VAT
 * robi API — operator, który przeliczałby je w pamięci, prędzej czy później
 * pomyli się o grosz, a to jest dokument księgowy.
 */
export async function wystawFaktureReczna(input: {
  userId: string;
  pozycje: PozycjaWej[];
  waluta: string;
  powod: string;
}): Promise<{ ok: true; numer: string } | { ok: false; error: string }> {
  try {
    const r = await adminApi<{ id: string; number: string }>("/admin/invoices/reczna", {
      method: "POST",
      body: input,
    });
    revalidatePath("/invoices");
    return { ok: true, numer: r.number };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof AdminApiError ? err.message : "Nie udało się wystawić faktury.",
    };
  }
}
