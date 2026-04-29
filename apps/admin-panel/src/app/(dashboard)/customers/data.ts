"use server";

import { adminApi } from "@/lib/api";

export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "USER" | "STAFF" | "ADMIN";
  walletBalance: string;
  createdAt: string;
  isTwoFactorEnabled: boolean;
  subscriptionsCount: number;
  lastLoginAt: string | null;
}

export interface ListUsersResponse {
  rows: AdminUserRow[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  offset: number;
}

export async function listAdminUsers(opts: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<ListUsersResponse> {
  const params = new URLSearchParams();
  if (opts.search) params.set("search", opts.search);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return adminApi<ListUsersResponse>(`/admin/users${qs ? `?${qs}` : ""}`);
}
