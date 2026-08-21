"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface CreatePromoInput {
  code: string;
  kind: "FIXED_CREDIT" | "PERCENT_BONUS" | "SERVICE_PERCENT_OFF";
  value: string;
  description?: string;
  maxRedemptions?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  appliesToRenewals?: boolean;
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
      error: 'Typ PERCENT_BONUS (doładowanie portfela) twórz ręcznie w API — w panelu użyj FIXED_CREDIT lub SERVICE_PERCENT_OFF.',
    };
  }

  if (input.kind === "SERVICE_PERCENT_OFF") {
    if (value < 1 || value > 100) {
      return { ok: false, error: "Rabat na usługę musi być z zakresu 1–100%." };
    }
  }

  try {
    await adminApi(`/admin/billing/promo-codes`, {
      method: "POST",
      body: {
        code,
        kind: input.kind,
        value: input.kind === "SERVICE_PERCENT_OFF" ? String(Math.round(value)) : value.toFixed(2),
        description: input.description?.trim() || undefined,
        maxRedemptions: input.maxRedemptions ?? null,
        validFrom: input.validFrom || undefined,
        validTo: input.validTo || undefined,
        appliesToRenewals: input.kind === "SERVICE_PERCENT_OFF" ? Boolean(input.appliesToRenewals) : false,
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
