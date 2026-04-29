import { adminApi, AdminApiError } from "@/lib/api";
import type { AuditFilters, AuditListResponse } from "./types";

export async function listAuditLogs(filters: AuditFilters): Promise<{
  ok: true;
  data: AuditListResponse;
} | { ok: false; error: string }> {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
  if (filters.search) params.set("search", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("limit", String(filters.limit ?? 50));
  params.set("offset", String(filters.offset ?? 0));

  try {
    const data = await adminApi<AuditListResponse>(
      `/admin/audit-logs?${params.toString()}`,
    );
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: "Unknown error" };
  }
}
