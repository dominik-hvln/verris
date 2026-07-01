import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EmailStatus, Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { AuditService } from '../common/audit/audit.service';
import { mailDeliveryFailureAlertTemplate } from '../mail/templates/ops-notifications';

const WINDOW_MINUTES = 30; // okno analizy
const MIN_SAMPLE = 10; // minimalna liczba maili, żeby liczyć odsetek (unikamy szumu)
const FAILURE_RATE_THRESHOLD = 40; // % FAILED, powyżej którego alertujemy
const ALERT_COOLDOWN_MS = 3 * 60 * 60 * 1000; // max 1 alert / 3h
const ALERT_ACTION = 'MAIL_FAILURE_RATE_ALERT';

/**
 * MAIL-W1 — watchdog wysyłki poczty. Co 15 min liczy odsetek maili ze statusem
 * FAILED w oknie {@link WINDOW_MINUTES} min. Po przekroczeniu progu wysyła alert
 * do wszystkich adminów (z cooldownem przez audit log). Zdejmuje maskowanie
 * problemów przez `swallowErrors` w MailerService — to przez nie awaria SMTP
 * długo bywa niewidoczna.
 */
@Injectable()
export class MailHealthScheduler {
  private readonly logger = new Logger(MailHealthScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (
      this.config.get<string>('adminPanelUrl') ??
      process.env.ADMIN_PANEL_URL ??
      'https://admin.verris.pl'
    ).replace(/\/$/, '');
  }

  @Cron(CronExpression.EVERY_15_MINUTES)
  async checkFailureRate(): Promise<void> {
    try {
      const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

      const grouped = await this.prisma.emailLog.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      });

      let total = 0;
      let failed = 0;
      for (const g of grouped) {
        total += g._count._all;
        if (g.status === EmailStatus.FAILED) failed = g._count._all;
      }

      if (total < MIN_SAMPLE) return; // za mała próba
      const ratePct = Math.round((failed / total) * 100);
      if (ratePct < FAILURE_RATE_THRESHOLD) return;

      // Cooldown — nie spamuj adminów.
      const lastAlert = await this.prisma.auditLog.findFirst({
        where: { action: ALERT_ACTION, createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (lastAlert) return;

      const topError = await this.mostCommonError(since);

      const admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN, anonymizedAt: null },
        select: { id: true, email: true, firstName: true },
      });
      if (admins.length === 0) return;

      const panelUrl = this.panelUrl();
      for (const admin of admins) {
        const msg = mailDeliveryFailureAlertTemplate({
          to: admin.email,
          firstName: admin.firstName,
          windowMinutes: WINDOW_MINUTES,
          failed,
          total,
          ratePct,
          topError,
          panelUrl,
        });
        await this.mailer.send({ ...msg, userId: admin.id, category: 'TRANSACTIONAL' });
      }

      await this.audit.record({
        action: ALERT_ACTION,
        details: { failed, total, ratePct, windowMinutes: WINDOW_MINUTES, topError },
      });
      this.logger.warn(
        `Mail failure watchdog: ${failed}/${total} (${ratePct}%) w ${WINDOW_MINUTES} min — zaalarmowano ${admins.length} adm.`,
      );
    } catch (err) {
      this.logger.error(
        `Mail failure watchdog error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Najczęstszy komunikat błędu wśród FAILED w oknie (skrócony). */
  private async mostCommonError(since: Date): Promise<string | null> {
    const rows = await this.prisma.emailLog.findMany({
      where: { status: EmailStatus.FAILED, createdAt: { gte: since }, errorMessage: { not: null } },
      select: { errorMessage: true },
      take: 200,
    });
    if (rows.length === 0) return null;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = (r.errorMessage ?? '').slice(0, 120);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let top: string | null = null;
    let max = 0;
    for (const [k, v] of counts) {
      if (v > max) {
        max = v;
        top = k;
      }
    }
    return top;
  }
}
