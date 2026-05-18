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
  loginBlocked: boolean;
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

export interface AdminCustomerOperationalDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  walletBalance: string;
  walletCurrency: string;
  stripeCustomerId: string | null;
  isTwoFactorEnabled: boolean;
  loginBlocked: boolean;
  loginBlockedReason: string | null;
  adminInternalNote: string | null;
  createdAt: string;
  deletionRequestedAt: string | null;
  subscriptionsCount: number;
}

export async function getCustomerOperationalDetail(userId: string): Promise<AdminCustomerOperationalDetail> {
  return adminApi<AdminCustomerOperationalDetail>(`/admin/users/${userId}/operational-detail`);
}
