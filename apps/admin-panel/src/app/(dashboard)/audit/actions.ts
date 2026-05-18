"use server";

import { API_URL } from "@/lib/api";
import { getAdminAuthToken } from "@/lib/auth";
import type { AuditFilters } from "./types";

export async function downloadAuditCsvAction(
  filters: AuditFilters,
): Promise<{ ok: true; csv: string; filename: string } | { ok: false; error: string }> {
  const token = await getAdminAuthToken();
  if (!token) return { ok: false, error: "Brak sesji administracyjnej" };

  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
  if (filters.search) params.set("search", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.category) params.set("category", filters.category);

  try {
    const res = await fetch(`${API_URL}/admin/audit-logs/export.csv?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `API ${res.status}` };
    }
    const csv = await res.text();
    const filename = `verris-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    return { ok: true, csv, filename };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
