"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface PozycjaKorektyWej {
  nazwa: string;
  ilosc: number;
  cenaBrutto: number;
}

/**
 * M-06 — wystawienie korekty.
 *
 * Korekta zmniejszająca zwraca różnicę do portfela klienta w tej samej
 * transakcji co dokument. Panel nie musi o tym pamiętać — API zwraca kwotę,
 * która wróciła, żeby operator zobaczył potwierdzenie, a nie żeby ją wywołał.
 */
export async function wystawKorekte(
  invoiceId: string,
  input: {
    rodzaj: "WARTOSCIOWA" | "FORMALNA";
    przyczyna: string;
    pozycjePo?: PozycjaKorektyWej[];
    nabywcaPo?: Record<string, unknown>;
  },
): Promise<{ ok: true; numer: string; zwrot: string } | { ok: false; error: string }> {
  try {
    const r = await adminApi<{ id: string; number: string; zwrot: string }>(
      `/admin/invoices/${encodeURIComponent(invoiceId)}/korekta`,
      { method: "POST", body: input },
    );
    revalidatePath("/invoices");
    return { ok: true, numer: r.number, zwrot: r.zwrot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AdminApiError ? err.message : "Nie udało się wystawić korekty.",
    };
  }
}
