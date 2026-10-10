import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmailCategory, EmailStatus, Prisma, Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { SupportActions } from '../common/audit/audit.actions.js';
import { maskujTekst, maskujWartosc } from './maskowanie.js';

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

/** Operator czytający dziennik poczty (z JWT). */
export interface OperatorOdczytu {
  userId: string;
  role: Role;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * D9 (10.10) — odczyt korespondencji klienta przez operatora: STAFF tylko na kontach klientów (USER),
   * każdy odczyt (także ADMIN-a) w dzienniku jak otwarcie zakładki karty klienta. Klient wpisu nie widzi.
   */
  private async odczytOperatora(aktor: OperatorOdczytu, userId: string | null, details: Record<string, string>) {
    if (aktor.role === Role.STAFF) {
      const u = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } }) : null;
      if (u?.role !== Role.USER) throw new ForbiddenException('Personel widzi wyłącznie korespondencję klientów.');
    }
    if (!userId) return;
    await this.audit.record({ action: SupportActions.OPERATOR_CUSTOMER_CARD_VIEWED, userId, actorUserId: aktor.userId, details });
  }

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

  /**
   * Podgląd wpisu (karta klienta → Komunikacja). Linki jednorazowe i tokeny maskowane w API
   * (`maskowanie.ts`) — operator nie dostaje ich w całości. Brak wpisu = 404, nie pusta odpowiedź.
   */
  async detail(id: string, aktor?: OperatorOdczytu) {
    const wpis = await this.prisma.emailLog.findUnique({ where: { id } });
    if (!wpis) throw new NotFoundException('Nie ma takiego wpisu dziennika poczty.');
    if (aktor) await this.odczytOperatora(aktor, wpis.userId, { sekcja: 'mail', emailLogId: wpis.id });
    return {
      ...wpis,
      subject: maskujTekst(wpis.subject),
      errorMessage: wpis.errorMessage ? maskujTekst(wpis.errorMessage) : null,
      metadata: maskujWartosc(wpis.metadata),
    };
  }

  async listForUser(userId: string, limit = 50, aktor?: OperatorOdczytu) {
    if (aktor) await this.odczytOperatora(aktor, userId, { sekcja: 'komunikacja' });
    const wpisy = await this.prisma.emailLog.findMany({
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
    // Lista na karcie klienta (zakładka Komunikacja) — temat i błąd maskowane jak w podglądzie.
    return wpisy.map((w) => ({ ...w, subject: maskujTekst(w.subject), errorMessage: w.errorMessage ? maskujTekst(w.errorMessage) : null }));
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
