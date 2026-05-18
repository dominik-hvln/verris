"use server";

import { adminApi, API_URL } from "@/lib/api";
import { getAdminAuthToken } from "@/lib/auth";

export type AdminInvoiceStatus = "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE";

export interface AdminInvoiceRow {
  id: string;
  number: string;
  status: AdminInvoiceStatus;
  amount: string;
  currency: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
  provider: string | null;
  providerRef: string | null;
  subscriptionId: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    companyName: string | null;
  };
  subscription: {
    id: string;
    planName: string | null;
    planSlug: string | null;
    domain: string | null;
  } | null;
  hasVerrisPdf: boolean;
}

export interface AdminInvoicesListDto {
  rows: AdminInvoiceRow[];
  total: number;
  limit: number;
  offset: number;
  filters: {
    userId: string | null;
    statuses: AdminInvoiceStatus[] | null;
    from: string | null;
    to: string | null;
    search: string | null;
  };
}

export interface InvoiceFilters {
  search?: string;
  userId?: string;
  statuses?: AdminInvoiceStatus[];
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function listAdminInvoices(filters: InvoiceFilters): Promise<AdminInvoicesListDto> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.statuses && filters.statuses.length > 0) {
    params.set("status", filters.statuses.join(","));
  }
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const limit = filters.limit ?? 50;
  const page = Math.max(1, filters.page ?? 1);
  params.set("limit", String(limit));
  params.set("offset", String((page - 1) * limit));
  return adminApi<AdminInvoicesListDto>(`/admin/invoices?${params.toString()}`);
}

/**
 * Builds an authenticated CSV download link payload. The browser cannot use
 * the bearer token directly, so we proxy this download through a Next.js
 * route handler — see `/api/invoices-csv/route.ts`.
 */
export async function buildCsvExportUrl(filters: InvoiceFilters): Promise<{
  apiPath: string;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.statuses && filters.statuses.length > 0) {
    params.set("status", filters.statuses.join(","));
  }
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return { apiPath: `/admin/invoices/export.csv?${params.toString()}` };
}

export async function downloadCsvServerSide(filters: InvoiceFilters): Promise<{
  csv: string;
  filename: string;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.statuses && filters.statuses.length > 0) {
    params.set("status", filters.statuses.join(","));
  }
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const token = await getAdminAuthToken();
  const res = await fetch(`${API_URL}/admin/invoices/export.csv?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Eksport CSV nieudany: ${res.status}`);
  }
  const csv = await res.text();
  return {
    csv,
    filename: `verris-faktury-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}
