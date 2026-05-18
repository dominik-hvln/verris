"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface CreatePromoInput {
  code: string;
  kind: "FIXED_CREDIT" | "PERCENT_BONUS";
  value: string;
  description?: string;
  maxRedemptions?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface CreatePromoResult {
  ok: boolean;
  error?: string;
  code?: string;
}

export async function createPromoAction(
  input: CreatePromoInput,
): Promise<CreatePromoResult> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    return { ok: false, error: "Kod: 3–40 znaków A-Z, 0-9, `_`, `-`." };
  }

  const value = Number.parseFloat(input.value.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "Wartość musi być liczbą większą od 0." };
  }

  if (input.kind === "PERCENT_BONUS") {
    return {
      ok: false,
      error: 'Typ PERCENT_BONUS jest jeszcze niewspierany w UI klienta — użyj FIXED_CREDIT (zasilanie kredytów).',
    };
  }

  try {
    await adminApi(`/admin/billing/promo-codes`, {
      method: "POST",
      body: {
        code,
        kind: input.kind,
        value: value.toFixed(2),
        description: input.description?.trim() || undefined,
        maxRedemptions: input.maxRedemptions ?? null,
        validFrom: input.validFrom || undefined,
        validTo: input.validTo || undefined,
      },
    });
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nie udało się utworzyć kodu — sprawdź logi API." };
  }

  revalidatePath("/promo-codes");
  return { ok: true, code };
}
