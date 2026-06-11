import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  SiteMonitor,
  SiteMonitorEventType,
  SiteMonitorStatus,
  SubscriptionStatus,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import {
  siteDownTemplate,
  siteRecoveredTemplate,
} from '../mail/templates/site-monitoring-notifications';

/** Two consecutive failed checks before we call it DOWN (anti-flap). */
const FAILS_BEFORE_DOWN = 2;
const CHECK_TIMEOUT_MS = 10_000;
const CONCURRENCY = 10;
/** Keep the incident list short and useful. */
const EVENTS_LIMIT = 20;

/**
 * B3 — opt-in monitoring of customer sites.
 *
 * UX contract (panel): one switch. URL is always the service's primary domain
 * over HTTPS — zero configuration. The scheduler checks every enabled monitor
 * each minute from the control plane, records DOWN/RECOVERED transitions and
 * e-mails the customer exactly once per transition.
 *
 * UP definition: ANY HTTP response with status < 500 (200/301/403/404 all mean
 * "the server serves traffic"). DOWN: network error, timeout or 5xx.
 */
@Injectable()
export class SiteMonitorService {
  private readonly logger = new Logger(SiteMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Customer API
  // ---------------------------------------------------------------------------

  async statusForSubscription(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const monitor = await this.prisma.siteMonitor.findUnique({
      where: { subscriptionId },
      include: { events: { orderBy: { createdAt: 'desc' }, take: EVENTS_LIMIT } },
    });
    return {
      domain: sub.account!.domain,
      enabled: monitor?.enabled ?? false,
      url: monitor?.url ?? `https://${sub.account!.domain}`,
      lastStatus: monitor?.lastStatus ?? 'UNKNOWN',
      lastCheckedAt: monitor?.lastCheckedAt?.toISOString() ?? null,
      lastHttpStatus: monitor?.lastHttpStatus ?? null,
      lastError: monitor?.lastError ?? null,
      downSince: monitor?.downSince?.toISOString() ?? null,
      events: (monitor?.events ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        httpStatus: e.httpStatus,
        durationS: e.durationS,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async setEnabled(subscriptionId: string, userId: string, enabled: boolean) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const url = `https://${sub.account!.domain}`;

    await this.prisma.siteMonitor.upsert({
      where: { subscriptionId },
      create: { subscriptionId, enabled, url },
      update: { enabled, url, ...(enabled ? {} : { consecutiveFails: 0 }) },
    });

    await this.audit.record({
      action: enabled ? 'SITE_MONITOR_ENABLED' : 'SITE_MONITOR_DISABLED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, url },
    });

    return this.statusForSubscription(subscriptionId, userId);
  }

  // ---------------------------------------------------------------------------
  // Scheduler
  // ---------------------------------------------------------------------------

  @Cron(CronExpression.EVERY_MINUTE, { name: 'site-monitor' })
  async tick(): Promise<void> {
    const monitors = await this.prisma.siteMonitor.findMany({
      where: {
        enabled: true,
        subscription: { status: SubscriptionStatus.ACTIVE },
      },
      include: {
        subscription: {
          select: {
            id: true,
            userId: true,
            user: { select: { email: true, firstName: true, anonymizedAt: true } },
            account: { select: { domain: true } },
          },
        },
      },
    });
    if (monitors.length === 0) return;

    const started = Date.now();
    let downs = 0;
    let recoveries = 0;

    // Bounded concurrency — a hung site must not stall the whole sweep.
    for (let i = 0; i < monitors.length; i += CONCURRENCY) {
      const batch = monitors.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map((m) => this.checkOne(m)));
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value === 'DOWN_TRANSITION') downs += 1;
          if (r.value === 'RECOVERED_TRANSITION') recoveries += 1;
        } else {
          this.logger.error(`Monitor check crashed: ${r.reason}`);
        }
      }
    }

    if (downs > 0 || recoveries > 0) {
      this.logger.log(
        `Site monitor sweep: ${monitors.length} checked in ${Date.now() - started}ms ` +
          `(down=${downs} recovered=${recoveries})`,
      );
    }
  }

  private async checkOne(
    monitor: SiteMonitor & {
      subscription: {
        id: string;
        userId: string;
        user: { email: string; firstName: string | null; anonymizedAt: Date | null };
        account: { domain: string } | null;
      };
    },
  ): Promise<'OK' | 'DOWN_TRANSITION' | 'RECOVERED_TRANSITION'> {
    const probe = await probeUrl(monitor.url);
    const now = new Date();

    if (probe.up) {
      const wasDown = monitor.lastStatus === SiteMonitorStatus.DOWN;
      await this.prisma.siteMonitor.update({
        where: { id: monitor.id },
        data: {
          lastStatus: SiteMonitorStatus.UP,
          consecutiveFails: 0,
          lastCheckedAt: now,
          lastHttpStatus: probe.httpStatus ?? null,
          lastError: null,
          downSince: null,
        },
      });

      if (wasDown) {
        const downSince = monitor.downSince ?? monitor.lastCheckedAt ?? now;
        const durationS = Math.max(60, Math.round((now.getTime() - downSince.getTime()) / 1000));
        await this.prisma.siteMonitorEvent.create({
          data: {
            monitorId: monitor.id,
            type: SiteMonitorEventType.RECOVERED,
            durationS,
            httpStatus: probe.httpStatus ?? null,
          },
        });
        this.notifyRecovered(monitor, durationS, now);
        return 'RECOVERED_TRANSITION';
      }
      return 'OK';
    }

    // Failed check.
    const fails = monitor.consecutiveFails + 1;
    const becomesDown =
      fails >= FAILS_BEFORE_DOWN && monitor.lastStatus !== SiteMonitorStatus.DOWN;

    await this.prisma.siteMonitor.update({
      where: { id: monitor.id },
      data: {
        consecutiveFails: fails,
        lastCheckedAt: now,
        lastHttpStatus: probe.httpStatus ?? null,
        lastError: probe.reason,
        ...(becomesDown
          ? { lastStatus: SiteMonitorStatus.DOWN, downSince: now }
          : {}),
      },
    });

    if (becomesDown) {
      await this.prisma.siteMonitorEvent.create({
        data: {
          monitorId: monitor.id,
          type: SiteMonitorEventType.DOWN,
          message: probe.reason,
          httpStatus: probe.httpStatus ?? null,
        },
      });
      this.notifyDown(monitor, probe.reason, now);
      return 'DOWN_TRANSITION';
    }
    return 'OK';
  }

  // ---------------------------------------------------------------------------
  // Mail (best-effort, never blocks the sweep)
  // ---------------------------------------------------------------------------

  private panelUrl(): string {
    return (
      this.config.get<string>('clientPanelUrl') ??
      this.config.get<string>('CLIENT_PANEL_URL') ??
      'https://panel.verris.pl'
    ).replace(/\/$/, '');
  }

  private notifyDown(
    monitor: SiteMonitor & {
      subscription: {
        id: string;
        userId: string;
        user: { email: string; firstName: string | null; anonymizedAt: Date | null };
        account: { domain: string } | null;
      };
    },
    reason: string,
    at: Date,
  ): void {
    const { user, account, id: subId, userId } = monitor.subscription;
    if (!account || user.anonymizedAt) return;
    const panelUrl = this.panelUrl();
    const message = siteDownTemplate({
      to: user.email,
      firstName: user.firstName,
      domain: account.domain,
      url: monitor.url,
      reason,
      checkedAt: at,
      panelUrl,
      serviceUrl: `${panelUrl}/dashboard/services/${subId}`,
    });
    void this.mailer
      .send({ ...message, userId, category: 'TRANSACTIONAL', fromRole: 'NOREPLY' })
      .catch((err) => {
        this.logger.warn(
          `site-down mail failed sub=${subId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private notifyRecovered(
    monitor: SiteMonitor & {
      subscription: {
        id: string;
        userId: string;
        user: { email: string; firstName: string | null; anonymizedAt: Date | null };
        account: { domain: string } | null;
      };
    },
    durationS: number,
    at: Date,
  ): void {
    const { user, account, id: subId, userId } = monitor.subscription;
    if (!account || user.anonymizedAt) return;
    const panelUrl = this.panelUrl();
    const message = siteRecoveredTemplate({
      to: user.email,
      firstName: user.firstName,
      domain: account.domain,
      url: monitor.url,
      downtimeMinutes: durationS / 60,
      recoveredAt: at,
      panelUrl,
      serviceUrl: `${panelUrl}/dashboard/services/${subId}`,
    });
    void this.mailer
      .send({ ...message, userId, category: 'TRANSACTIONAL', fromRole: 'NOREPLY' })
      .catch((err) => {
        this.logger.warn(
          `site-recovered mail failed sub=${subId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private async requireOwnedSub(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) {
      throw new BadRequestException('Monitoring będzie dostępny po aktywacji konta hostingowego.');
    }
    return sub;
  }
}

/** HTTP probe: UP = any response with status < 500. */
async function probeUrl(
  url: string,
): Promise<{ up: boolean; httpStatus?: number; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Verris-Monitor/1.0 (+https://verris.pl)' },
    });
    if (res.status >= 500) {
      return { up: false, httpStatus: res.status, reason: `HTTP ${res.status}` };
    }
    return { up: true, httpStatus: res.status, reason: 'OK' };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      up: false,
      reason: aborted
        ? `timeout po ${CHECK_TIMEOUT_MS / 1000} s`
        : `błąd połączenia (${err instanceof Error ? simplifyNetError(err.message) : 'nieznany'})`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function simplifyNetError(msg: string): string {
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'DNS nie odpowiada';
  if (/ECONNREFUSED/i.test(msg)) return 'połączenie odrzucone';
  if (/ECONNRESET/i.test(msg)) return 'połączenie zerwane';
  if (/certificate|TLS|SSL/i.test(msg)) return 'problem z certyfikatem SSL';
  return msg.slice(0, 120);
}
