"use server";

import { adminApi } from "@/lib/api";

export interface ResellerRow {
  userId: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  brandName: string | null;
  markupPct: number;
  code: string;
  createdAt: string;
}

export async function listResellers(): Promise<ResellerRow[]> {
  return adminApi<ResellerRow[]>("/admin/reseller");
}
