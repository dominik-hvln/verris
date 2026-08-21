import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ticketCustomerReminderTemplate,
  ticketAutoClosedTemplate,
  ticketSlaBreachStaffTemplate,
} from '../mail/templates/ticket-notifications';

/**
 * SUP-V2 — pilnowanie SLA i braku odpowiedzi klienta.
 *
 * Uruchamiane co godzinę. Trzy obowiązki:
 *  1) Alert do staff, gdy minął SLA pierwszej odpowiedzi, a nikt jeszcze nie odpisał
 *     (raz na ticket — pole `slaResponseBreachAlertedAt`).
 *  2) Przypomnienie do klienta, gdy ticket czeka na jego odpowiedź dłużej niż
 *     `REMIND_AFTER_DAYS` (raz — pole `customerReminderSentAt`).
 *  3) Auto-zamknięcie, gdy klient nie odpowiada dłużej niż `CLOSE_AFTER_DAYS`.
 *
 * Idempotencja opiera się o pola-znaczniki na Ticket oraz przejście statusu,
 * więc kolejne przebiegi nie dublują e-maili.
 */
const REMIND_AFTER_DAYS = 2;
const CLOSE_AFTER_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TicketSlaScheduler {
  private readonly logger = new Logger(TicketSlaScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  private clientPanelBaseUrl(): string {
    return (this.config.get<string>('clientPanelUrl') ?? 'http://localhost:3001').replace(/\/$/, '');
  }

  private staffPanelBaseUrl(): string {
    return (
      this.config.get<string>('STAFF_PANEL_URL') ??
      this.config.get<string>('staffPanelUrl') ??
      this.clientPanelBaseUrl()
    ).replace(/\/$/, '');
  }

  private async logEvent(
    ticketId: string,
    type: string,
    meta?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    try {
      await this.prisma.ticketEvent.create({
        data: { ticketId, type, actorId: null, meta: meta ?? undefined },
      });
    } catch {
      /* oś czasu pomocnicza */
    }
  }

  @Cron('35 * * * *', { name: 'tickets:sla-watch' })
  async hourlyTick(): Promise<void> {
    try {
      await this.alertStaffOnResponseBreach();
    } catch (err) {
      this.logger.error(`SLA breach alert failed: ${(err as Error).message}`, (err as Error).stack);
    }
    try {
      await this.remindCustomersNoReply();
    } catch (err) {
      this.logger.error(`customer reminder failed: ${(err as Error).message}`, (err as Error).stack);
    }
    try {
      await this.autoCloseStale();
    } catch (err) {
      this.logger.error(`auto-close failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  /** 1) SLA pierwszej odpowiedzi przekroczone — alert do staff (raz). */
  async alertStaffOnResponseBreach(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.ticket.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        firstResponseAt: null,
        slaResponseBreachAlertedAt: null,
        slaResponseDueAt: { lt: now },
      },
      include: { assignedTo: { select: { id: true, email: true } } },
      take: 200,
    });
    if (!due.length) return;

    const staffPanelUrl = this.staffPanelBaseUrl();
    let alerted = 0;
    for (const t of due) {
      // Adresaci: przypisana osoba, a gdy jej brak — administratorzy.
      const recipients: Array<{ id: string; email: string | null }> = [];
      if (t.assignedTo) {
        recipients.push({ id: t.assignedTo.id, email: t.assignedTo.email });
      } else {
        const admins = await this.prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true, email: true },
          take: 20,
        });
        recipients.push(...admins);
      }

      for (const r of recipients) {
        await this.notifications.create({
          userId: r.id,
          category: 'SUPPORT',
          severity: 'critical',
          title: 'SLA pierwszej odpowiedzi przekroczone',
          body: `#${t.id.slice(0, 8)} — ${t.subject}`,
          link: `/tickets/${t.id}`,
        });
        if (r.email && t.slaResponseDueAt) {
          void this.mailer
            .send({
              ...ticketSlaBreachStaffTemplate({
                to: r.email,
                ticketId: t.id,
                subject: t.subject,
                staffPanelUrl,
                dueAt: t.slaResponseDueAt,
              }),
              category: 'TRANSACTIONAL',
              fromRole: 'NOREPLY',
            })
            .catch(() => undefined);
        }
      }

      await this.prisma.ticket.update({
        where: { id: t.id },
        data: { slaResponseBreachAlertedAt: now },
      });
      await this.logEvent(t.id, 'SLA_RESPONSE_BREACH_ALERTED', {
        dueAt: t.slaResponseDueAt ? t.slaResponseDueAt.toISOString() : null,
      });
      alerted += 1;
    }
    this.logger.log(`SLA breach: zaalarmowano ${alerted} zgłoszeń`);
  }

  /** 2) Klient nie odpowiada > REMIND_AFTER_DAYS — jednorazowe przypomnienie. */
  async remindCustomersNoReply(): Promise<void> {
    const now = Date.now();
    const remindBefore = new Date(now - REMIND_AFTER_DAYS * DAY_MS);
    const closeBefore = new Date(now - CLOSE_AFTER_DAYS * DAY_MS);
    const due = await this.prisma.ticket.findMany({
      where: {
        status: 'WAITING_CUSTOMER',
        customerReminderSentAt: null,
        waitingSince: { lte: remindBefore, gt: closeBefore },
      },
      include: { user: { select: { email: true, anonymizedAt: true } } },
      take: 200,
    });
    if (!due.length) return;

    const panelUrl = this.clientPanelBaseUrl();
    const closeInDays = CLOSE_AFTER_DAYS - REMIND_AFTER_DAYS;
    let sent = 0;
    for (const t of due) {
      await this.prisma.ticket.update({
        where: { id: t.id },
        data: { customerReminderSentAt: new Date() },
      });
      await this.logEvent(t.id, 'CUSTOMER_REMINDER_SENT', { closeInDays });
      if (t.user?.anonymizedAt) continue;
      await this.notifications.create({
        userId: t.userId,
        category: 'SUPPORT',
        severity: 'info',
        title: 'Czekamy na Twoją odpowiedź',
        body: `#${t.id.slice(0, 8)} — ${t.subject}`,
        link: `/dashboard/support/${t.id}`,
      });
      if (t.user?.email) {
        void this.mailer
          .send({
            ...ticketCustomerReminderTemplate({
              ticketId: t.id,
              subject: t.subject,
              customerEmail: t.user.email,
              panelUrl,
              closeInDays,
            }),
            category: 'TRANSACTIONAL',
            fromRole: 'SUPPORT',
          })
          .catch(() => undefined);
      }
      sent += 1;
    }
    this.logger.log(`przypomnienia braku odpowiedzi: ${sent} wysłanych`);
  }

  /** 3) Klient nie odpowiada > CLOSE_AFTER_DAYS — auto-zamknięcie. */
  async autoCloseStale(): Promise<void> {
    const now = new Date();
    const closeBefore = new Date(Date.now() - CLOSE_AFTER_DAYS * DAY_MS);
    const due = await this.prisma.ticket.findMany({
      where: {
        status: 'WAITING_CUSTOMER',
        waitingSince: { lte: closeBefore },
      },
      include: {
        user: { select: { email: true, anonymizedAt: true } },
        assignedTo: { select: { id: true } },
      },
      take: 200,
    });
    if (!due.length) return;

    const panelUrl = this.clientPanelBaseUrl();
    let closed = 0;
    for (const t of due) {
      await this.prisma.ticket.update({
        where: { id: t.id },
        data: { status: 'CLOSED', autoClosedAt: now, resolvedAt: now },
      });
      await this.logEvent(t.id, 'AUTO_CLOSED', { afterDays: CLOSE_AFTER_DAYS });
      if (t.assignedTo) {
        await this.notifications.create({
          userId: t.assignedTo.id,
          category: 'SUPPORT',
          severity: 'info',
          title: 'Zgłoszenie zamknięte automatycznie',
          body: `#${t.id.slice(0, 8)} — ${t.subject} (brak odpowiedzi klienta)`,
          link: `/tickets/${t.id}`,
        });
      }
      if (t.user?.email && !t.user.anonymizedAt) {
        void this.mailer
          .send({
            ...ticketAutoClosedTemplate({
              ticketId: t.id,
              subject: t.subject,
              customerEmail: t.user.email,
              panelUrl,
            }),
            category: 'TRANSACTIONAL',
            fromRole: 'SUPPORT',
          })
          .catch(() => undefined);
      }
      closed += 1;
    }
    this.logger.log(`auto-zamknięcia: ${closed} zgłoszeń`);
  }
}
