"use server";

import { adminApi } from "@/lib/api";

export interface CapturedError {
  id: string;
  at: string;
  type: string;
  message: string;
  method?: string;
  path?: string;
  status?: number;
  userId?: string;
  fingerprint: string;
  stack?: string;
}

export interface RuntimeErrorsResponse {
  summary: { total: number; byType: Array<{ type: string; count: number }> };
  recent: CapturedError[];
}

/** CYBER-9 — pobiera ostatnie błędy runtime z API (ADMIN/STAFF). */
export async function getRuntimeErrors(limit = 100): Promise<RuntimeErrorsResponse> {
  return adminApi<RuntimeErrorsResponse>(`/admin/observability/errors?limit=${limit}`, {
    cache: "no-store",
  });
}
