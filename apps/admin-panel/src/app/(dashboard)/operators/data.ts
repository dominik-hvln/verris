"use server";

import { adminApi } from "@/lib/api";

export type OperatorRole = "STAFF" | "ADMIN";

export interface OperatorRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: OperatorRole;
  isTwoFactorEnabled: boolean;
  loginBlocked: boolean;
  canAccessGrafana: boolean;
  createdAt: string;
}

export interface OperatorListResponse {
  rows: OperatorRow[];
  total: number;
  page: number;
  totalPages: number;
}

export async function listOperators(opts: {
  search?: string;
  role?: OperatorRole;
  page?: number;
}): Promise<OperatorListResponse> {
  const params = new URLSearchParams();
  if (opts.search) params.set("search", opts.search);
  if (opts.role) params.set("role", opts.role);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  params.set("limit", "100");
  const data = await adminApi<{
    rows: OperatorRow[];
    total: number;
    page: number;
    totalPages: number;
  }>(`/admin/users?${params.toString()}`);
  // Ograniczenie do operatorów (gdy front nie wymusi roli, listing zwraca też USER).
  const filtered = data.rows.filter((r) => r.role === "STAFF" || r.role === "ADMIN");
  return {
    rows: filtered,
    total: opts.role ? data.total : filtered.length,
    page: data.page,
    totalPages: data.totalPages,
  };
}
