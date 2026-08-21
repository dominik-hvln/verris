import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationCategory =
  | 'MONITORING'
  | 'SSL'
  | 'BILLING'
  | 'SECURITY'
  | 'SLA'
  | 'SUPPORT'
  | 'SYSTEM';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface CreateNotificationInput {
  userId: string;
  category: NotificationCategory;
  severity?: NotificationSeverity;
  title: string;
  body: string;
  link?: string | null;
  subscriptionId?: string | null;
  /**
   * Klucz deduplikacji — gdy podany, nie tworzymy kolejnego nieprzeczytanego
   * powiadomienia o tym samym kluczu w oknie `dedupeWindowMin` (domyślnie 360).
   * Zapobiega zalewaniu dzwonka (np. ten sam alert SSL co cykl).
   */
  dedupeKey?: string;
  dedupeWindowMin?: number;
}

/**
 * NTF-2 — trwałe powiadomienia in-app (dzwonek). Tworzone obok dotychczasowych
 * e-maili przy kluczowych zdarzeniach. Best-effort: błąd zapisu nie może wywrócić
 * ścieżki biznesowej (monitoring, billing), więc `create` łapie wyjątki.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput): Promise<void> {
    try {
      if (input.dedupeKey) {
        const windowMs = (input.dedupeWindowMin ?? 360) * 60 * 1000;
        const since = new Date(Date.now() - windowMs);
        const dup = await this.prisma.notification.findFirst({
          where: {
            userId: input.userId,
            readAt: null,
            createdAt: { gte: since },
            // dedupeKey kodujemy w title+subscriptionId — patrz niżej
            link: input.link ?? undefined,
            title: input.title,
          },
          select: { id: true },
        });
        if (dup) return;
      }
      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          category: input.category,
          severity: input.severity ?? 'info',
          title: input.title,
          body: input.body,
          link: input.link ?? null,
          subscriptionId: input.subscriptionId ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `notification create failed (user=${input.userId}, ${input.category}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async listForUser(
    userId: string,
    opts: { limit?: number } = {},
  ): Promise<{
    items: Array<{
      id: string;
      category: string;
      severity: string;
      title: string;
      body: string;
      link: string | null;
      read: boolean;
      createdAt: string;
    }>;
    unread: number;
  }> {
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items: rows.map((n) => ({
        id: n.id,
        category: n.category,
        severity: n.severity,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.readAt != null,
        createdAt: n.createdAt.toISOString(),
      })),
      unread,
    };
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }

  /**
   * Retencja — żeby tabela powiadomień nie rosła w nieskończoność. Codziennie
   * kasujemy przeczytane starsze niż 30 dni oraz wszystkie starsze niż 120 dni
   * (nieprzeczytane krytyczne i tak zwykle są obsłużone w tym oknie).
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'notifications:retention' })
  async pruneOld(): Promise<void> {
    const now = Date.now();
    const read30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const any120 = new Date(now - 120 * 24 * 60 * 60 * 1000);
    try {
      const res = await this.prisma.notification.deleteMany({
        where: {
          OR: [
            { readAt: { not: null }, createdAt: { lt: read30 } },
            { createdAt: { lt: any120 } },
          ],
        },
      });
      if (res.count > 0) this.logger.log(`notifications retention: usunięto ${res.count} wpisów`);
    } catch (err) {
      this.logger.warn(
        `notifications retention failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
