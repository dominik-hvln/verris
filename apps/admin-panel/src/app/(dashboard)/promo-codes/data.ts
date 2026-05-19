"use server";

import { adminApi } from "@/lib/api";

export interface PromoCodeRow {
  id: string;
  code: string;
  kind: "FIXED_CREDIT" | "PERCENT_BONUS" | "SERVICE_PERCENT_OFF";
  appliesToRenewals?: boolean;
  value: string;
  currency: string;
  description: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listPromoCodes(): Promise<PromoCodeRow[]> {
  return adminApi<PromoCodeRow[]>(`/admin/billing/promo-codes`);
}
