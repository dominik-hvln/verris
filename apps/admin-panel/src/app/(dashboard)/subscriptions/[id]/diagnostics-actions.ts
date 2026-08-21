"use server";

import { adminApi, AdminApiError } from "@/lib/api";

export interface DiagnosticFinding {
  area: string;
  status: "ok" | "warn" | "critical";
  title: string;
  detail: string;
  action: string | null;
}

export interface ServiceDiagnostics {
  subscriptionId: string;
  generatedAt: string;
  overall: "ok" | "attention" | "critical";
  summary: string;
  findings: DiagnosticFinding[];
}

export async function runDiagnosticsAction(
  id: string,
): Promise<{ ok: true; data: ServiceDiagnostics } | { ok: false; error: string }> {
  try {
    const data = await adminApi<ServiceDiagnostics>(`/admin/subscriptions/${id}/diagnostics`);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Nie udało się uruchomić diagnostyki." };
  }
}
