"use server";

import { adminApi, AdminApiError } from "@/lib/api";

export type ReadinessStatus = "ok" | "warn" | "fail";

export interface ReadinessCheck {
  key: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  blocking: boolean;
}

export interface ReadinessReport {
  generatedAt: string;
  go: boolean;
  counts: { ok: number; warn: number; fail: number };
  checks: ReadinessCheck[];
}

export async function fetchLiveReadiness() {
  try {
    return { data: await adminApi<ReadinessReport>("/admin/live-readiness") };
  } catch (e) {
    return { error: e instanceof AdminApiError ? e.message : "Nie udało się pobrać raportu." };
  }
}
