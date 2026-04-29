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

export interface AuditFilters {
  action?: string;
  userId?: string;
  actorUserId?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
