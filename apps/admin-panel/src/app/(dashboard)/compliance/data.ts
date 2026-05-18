"use server";

import { adminApi } from "@/lib/api";

export interface LegalDocumentDto {
  kind: "TERMS" | "PRIVACY" | "COOKIES" | "DPA";
  version: string;
  locale: string;
  title: string;
  contentMarkdown: string;
  changelogMarkdown: string | null;
  publishedAt: string;
}

export interface LegalVersionRow {
  version: string;
  publishedAt: string;
  isCurrent: boolean;
}

export type CurrentDocsMap = Record<
  "TERMS" | "PRIVACY" | "COOKIES" | "DPA",
  LegalDocumentDto | null
>;

export interface AdminConsentRow {
  id: string;
  userId: string;
  documentKind: string;
  documentVersion: string;
  locale: string;
  grantedAt: string;
  withdrawnAt: string | null;
  source: string;
  ipAddress: string | null;
  userAgent: string | null;
  user: { id: string; email: string; anonymizedAt: string | null } | null;
}

export interface AdminDataExportRow {
  id: string;
  userId: string;
  status: "PENDING" | "GENERATING" | "READY" | "EXPIRED" | "FAILED";
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  sizeBytes: number | null;
  errorMessage: string | null;
  user: { id: string; email: string; anonymizedAt: string | null } | null;
}

export interface AdminDeletionRow {
  userId: string;
  requestedAt: string;
  scheduledFor: string;
  cancelledAt: string | null;
  anonymizedAt: string | null;
  anonymizedById: string | null;
  reason: string | null;
  user: { id: string; email: string; anonymizedAt: string | null } | null;
  anonymizedByAdmin: { id: string; email: string } | null;
}

export async function fetchCurrentLegalDocs(): Promise<CurrentDocsMap> {
  return adminApi<CurrentDocsMap>("/admin/compliance/documents");
}

export async function fetchLegalVersions(
  kind: string,
): Promise<LegalVersionRow[]> {
  return adminApi<LegalVersionRow[]>(
    `/admin/compliance/documents/${kind}/versions`,
  );
}

export async function fetchConsents(filters: {
  userId?: string;
  kind?: string;
  version?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AdminConsentRow[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.version) params.set("version", filters.version);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return adminApi(`/admin/compliance/consents${qs ? `?${qs}` : ""}`);
}

export async function fetchDataExports(): Promise<AdminDataExportRow[]> {
  return adminApi("/admin/compliance/data-exports?limit=200");
}

export async function fetchDeletionRequests(): Promise<AdminDeletionRow[]> {
  return adminApi("/admin/compliance/deletion-requests");
}
