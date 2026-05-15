import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLog, Prisma } from '@verris/database';

export interface AuditPayload {
  /** Symbolic name of the action, e.g. "SERVER_INIT", "SUBSCRIPTION_CREATED" */
  action: string;
  /** The user the audit log is *about* (target). */
  userId?: string | null;
  /** The actor that triggered the action (admin/staff). */
  actorUserId?: string | null;
  /** Staff id when staff acts on a user's behalf. */
  impersonatedBy?: string | null;
  /** Free-form structured details — kept as JSON. */
  details?: Prisma.InputJsonValue;
  /** Caller IP address. */
  ipAddress?: string | null;
  /** Caller user-agent (optional). */
  userAgent?: string | null;
}

export interface AuditQueryFilters {
  action?: string;
  userId?: string;
  actorUserId?: string;
  /** Inclusive lower bound on `createdAt`. */
  from?: Date;
  /** Inclusive upper bound on `createdAt`. */
  to?: Date;
  /** Free-text contains-search across `action` (case-insensitive). */
  search?: string;
}

export interface AuditQueryOptions extends AuditQueryFilters {
  limit?: number;
  offset?: number;
}

export interface AuditLogWithUsers extends AuditLog {
  user: { id: string; email: string } | null;
  actor: { id: string; email: string } | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(payload: AuditPayload): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: payload.action,
          userId: payload.userId ?? null,
          actorUserId: payload.actorUserId ?? null,
          impersonatedBy: payload.impersonatedBy ?? null,
          details: payload.details ?? Prisma.JsonNull,
          ipAddress: payload.ipAddress ?? null,
          userAgent: payload.userAgent ?? null,
        },
      });
    } catch (err) {
      // Never let audit failures break the request flow — but log loudly.
      this.logger.error(
        `Failed to record audit log for action=${payload.action}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Read API used by the admin panel (E-7)
  // ---------------------------------------------------------------------------

  async list(options: AuditQueryOptions): Promise<{
    rows: AuditLogWithUsers[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = clamp(options.limit ?? 50, 1, 200);
    const offset = Math.max(0, options.offset ?? 0);
    const where = this.buildWhere(options);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      rows: await this.hydrateUsers(rows),
      total,
      limit,
      offset,
    };
  }

  /**
   * Iterates *all* matching rows in stable, time-ordered batches. Used by the
   * CSV export endpoint so we can stream rows without loading the entire log
   * into memory at once.
   */
  async *iterate(filters: AuditQueryFilters, batchSize = 500) {
    const where = this.buildWhere(filters);
    let cursorId: string | undefined;

    while (true) {
      const batch = await this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: batchSize,
        ...(cursorId
          ? {
              skip: 1,
              cursor: { id: cursorId },
            }
          : {}),
      });
      if (batch.length === 0) return;
      const hydrated = await this.hydrateUsers(batch);
      for (const row of hydrated) yield row;
      if (batch.length < batchSize) return;
      cursorId = batch[batch.length - 1].id;
    }
  }

  private buildWhere(filters: AuditQueryFilters): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.action) where.action = filters.action;
    if (filters.userId) where.userId = filters.userId;
    if (filters.actorUserId) where.actorUserId = filters.actorUserId;
    if (filters.search && !filters.action) {
      where.action = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    return where;
  }

  private async hydrateUsers(rows: AuditLog[]): Promise<AuditLogWithUsers[]> {
    if (rows.length === 0) return [];
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.userId) ids.add(r.userId);
      if (r.actorUserId) ids.add(r.actorUserId);
    }
    const users =
      ids.size === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: Array.from(ids) } },
            select: { id: true, email: true },
          });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((row) => ({
      ...row,
      user: row.userId ? (byId.get(row.userId) ?? null) : null,
      actor: row.actorUserId ? (byId.get(row.actorUserId) ?? null) : null,
    }));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
