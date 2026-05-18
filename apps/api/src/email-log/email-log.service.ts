import { Injectable } from '@nestjs/common';
import { EmailCategory, EmailStatus, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

export interface EmailLogFilters {
  category?: EmailCategory;
  status?: EmailStatus;
  tag?: string;
  toEmail?: string;
  userId?: string;
  campaignId?: string;
  /** ISO daty — `from`/`to` filtruje po `createdAt`. */
  from?: string;
  to?: string;
  /** Pełnotekstowe wyszukanie po subject (ILIKE %q%). */
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface EmailLogPage {
  items: Array<{
    id: string;
    toEmail: string;
    userId: string | null;
    category: EmailCategory;
    tag: string | null;
    subject: string;
    status: EmailStatus;
    providerId: string | null;
    messageId: string | null;
    errorMessage: string | null;
    campaignId: string | null;
    createdAt: Date;
    sentAt: Date | null;
  }>;
  /** Cursor do kolejnej strony (id ostatniego elementu) — null gdy koniec. */
  nextCursor: string | null;
  /** Aggregat statusu dla bieżącego filtra (do dashboard widget'u). */
  stats: {
    total: number;
    sent: number;
    failed: number;
    suppressed: number;
    queued: number;
    bounced: number;
  };
}

/**
 * Sprint 2.7 — read-only API dla admin viewer'a EmailLog.
 *
 * Cursor-paginated (na `id` malejąco po `createdAt`) — page-based padałoby
 * przy ~10k wpisów/dzień. Cursor jest opaque dla frontendu.
 */
@Injectable()
export class EmailLogService {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 200;

  constructor(private readonly prisma: PrismaService) {}

  async list(filters: EmailLogFilters): Promise<EmailLogPage> {
    const where = this.buildWhere(filters);
    const limit = Math.min(
      filters.limit ?? EmailLogService.DEFAULT_LIMIT,
      EmailLogService.MAX_LIMIT,
    );

    const baseQuery: Prisma.EmailLogFindManyArgs = {
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        toEmail: true,
        userId: true,
        category: true,
        tag: true,
        subject: true,
        status: true,
        providerId: true,
        messageId: true,
        errorMessage: true,
        campaignId: true,
        createdAt: true,
        sentAt: true,
      },
    };
    if (filters.cursor) {
      baseQuery.cursor = { id: filters.cursor };
      baseQuery.skip = 1;
    }

    const [itemsRaw, stats] = await Promise.all([
      this.prisma.emailLog.findMany(baseQuery),
      this.computeStats(where),
    ]);
    const items = itemsRaw as unknown as EmailLogPage['items'];

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const next = items.pop();
      nextCursor = next?.id ?? null;
    }

    return { items, nextCursor, stats };
  }

  async detail(id: string) {
    return this.prisma.emailLog.findUnique({ where: { id } });
  }

  async listForUser(userId: string, limit = 50) {
    return this.prisma.emailLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, EmailLogService.MAX_LIMIT),
      select: {
        id: true,
        category: true,
        tag: true,
        subject: true,
        status: true,
        createdAt: true,
        sentAt: true,
        errorMessage: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildWhere(f: EmailLogFilters): Prisma.EmailLogWhereInput {
    const where: Prisma.EmailLogWhereInput = {};
    if (f.category) where.category = f.category;
    if (f.status) where.status = f.status;
    if (f.tag) where.tag = f.tag;
    if (f.toEmail) where.toEmail = f.toEmail;
    if (f.userId) where.userId = f.userId;
    if (f.campaignId) where.campaignId = f.campaignId;
    if (f.q) where.subject = { contains: f.q, mode: 'insensitive' };
    if (f.from || f.to) {
      where.createdAt = {};
      if (f.from) where.createdAt.gte = new Date(f.from);
      if (f.to) where.createdAt.lte = new Date(f.to);
    }
    return where;
  }

  private async computeStats(where: Prisma.EmailLogWhereInput): Promise<EmailLogPage['stats']> {
    const grouped = await this.prisma.emailLog.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const stats = {
      total: 0,
      sent: 0,
      failed: 0,
      suppressed: 0,
      queued: 0,
      bounced: 0,
    };
    for (const g of grouped) {
      const count = g._count._all;
      stats.total += count;
      switch (g.status) {
        case EmailStatus.SENT:
          stats.sent = count;
          break;
        case EmailStatus.FAILED:
          stats.failed = count;
          break;
        case EmailStatus.SUPPRESSED:
          stats.suppressed = count;
          break;
        case EmailStatus.QUEUED:
          stats.queued = count;
          break;
        case EmailStatus.BOUNCED:
          stats.bounced = count;
          break;
      }
    }
    return stats;
  }
}
