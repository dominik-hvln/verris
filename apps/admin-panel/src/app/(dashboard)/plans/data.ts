"use server";

import { adminApi } from "@/lib/api";

export interface AdminPlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  ioLimitKbps: number;
  iopsLimit: number;
  entryProcesses: number;
  nprocLimit: number;
  includedTransferGb: number | null;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  stripeProductId: string | null;
  stripePriceMonthlyId: string | null;
  stripePriceYearlyId: string | null;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  /** O-1 — free trial length in days. 0 = no trial available. */
  trialDays: number;
  /** HOSTING vs standalone e-mail product (P-1b). */
  productKind: 'HOSTING' | 'EMAIL';
  /** SUP-4 — SLA response window in hours; 0 = no SLA badge. */
  supportSlaHours: number;
  autoscalingMaxOverscaleCpu: number;
  autoscalingMaxOverscaleRam: number;
  autoscalingMaxOverscaleDisk: number;
  createdAt: string;
  updatedAt: string;
}

export async function listAdminPlans(): Promise<AdminPlanRow[]> {
  return adminApi<AdminPlanRow[]>(`/admin/plans`);
}

export async function getAdminPlan(id: string): Promise<AdminPlanRow> {
  return adminApi<AdminPlanRow>(`/admin/plans/${id}`);
}
