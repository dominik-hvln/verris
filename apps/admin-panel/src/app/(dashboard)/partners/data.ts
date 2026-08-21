"use server";

import { adminApi } from "@/lib/api";

export interface PartnerConfig {
  enabled: boolean;
  commissionPct: number;
  holdDays: number;
  minPayout: number;
  freeHostingThreshold: number;
  freeHostingCredit: number;
}

export interface AdminPayout {
  id: string;
  partnerUserId: string;
  method: "WALLET" | "BANK";
  amount: string;
  currency: string;
  status: "REQUESTED" | "PAID" | "REJECTED";
  bankAccount: string | null;
  requestedAt: string;
  processedAt: string | null;
}

export async function getPartnerConfig(): Promise<PartnerConfig> {
  return adminApi<PartnerConfig>("/admin/partners/config");
}

export async function listPartnerPayouts(status?: string): Promise<AdminPayout[]> {
  return adminApi<AdminPayout[]>(`/admin/partners/payouts${status ? `?status=${status}` : ""}`);
}
