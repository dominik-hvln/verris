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
  anonymizedAt?: string | null;
  isInternal?: boolean;
}

export interface ListUsersResponse {
  rows: AdminUserRow[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  offset: number;
}

/** F2.4 — filtry listy klientów (nazwy jak w API; puste pomijane). */
export interface FiltryKlientow {
  search?: string;
  status?: string;
  saldoOd?: string;
  saldoDo?: string;
  od?: string;
  do?: string;
}

const KLUCZE_FILTROW = ["search", "status", "saldoOd", "saldoDo", "od", "do"] as const;

export async function listAdminUsers(opts: FiltryKlientow & { page?: number; limit?: number }): Promise<ListUsersResponse> {
  const params = new URLSearchParams();
  for (const k of KLUCZE_FILTROW) {
    const v = opts[k]?.trim();
    if (v) params.set(k, v);
  }
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
  /** PROD-03 — konto wewnętrzne (testowe). */
  isInternal?: boolean;
  createdAt: string;
  deletionRequestedAt: string | null;
  subscriptionsCount: number;
}

export async function getCustomerOperationalDetail(userId: string): Promise<AdminCustomerOperationalDetail> {
  return adminApi<AdminCustomerOperationalDetail>(`/admin/users/${userId}/operational-detail`);
}
