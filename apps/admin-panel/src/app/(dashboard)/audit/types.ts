export interface AuditLogRow {
  id: string;
  action: string;
  details: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  userId: string | null;
  user: { id: string; email: string } | null;
  actorUserId: string | null;
  actor: { id: string; email: string } | null;
  impersonatedBy: string | null;
  createdAt: string;
}

export interface AuditListResponse {
  rows: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}

export type AuditCategory = "RODO" | "ADMIN_OPS" | "SECURITY" | "IMPERSONATION";

export interface AuditFilters {
  action?: string;
  userId?: string;
  actorUserId?: string;
  search?: string;
  from?: string;
  to?: string;
  category?: AuditCategory;
  limit?: number;
  offset?: number;
}
