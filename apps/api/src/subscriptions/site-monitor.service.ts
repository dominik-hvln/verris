import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Prisma,
  SiteMonitor,
  SiteMonitorEventType,
  SiteMonitorStatus,
  SubscriptionStatus,
  WalletTxType,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import * as tls from 'node:tls';
import {
  siteDownTemplate,
  siteRecoveredTemplate,
  monitoringPaidLapsedTemplate,
  sslExpiringTemplate,
} from '../mail/templates/site-monitoring-notifications';

/** Two consecutive failed checks before we call it DOWN (anti-flap). */
const FAILS_BEFORE_DOWN = 2;
const CHECK_TIMEOUT_MS = 10_000;
const CONCURRENCY = 10;
/** Keep the incident list short and useful. */
const EVENTS_LIMIT = 20;

/** Zapas na jitter crona, by „należny teraz" monitor nie wypadł z okna. */
const INTERVAL_SLACK_MS = 15_000;
/** MON-5 — ostrzegaj, gdy certyfikat TLS wygasa w ciągu tylu dni. */
const SSL_WARN_DAYS = 14;
const TLS_PROBE_TIMEOUT_MS = 8_000;

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
    private readonly walletLedger: WalletLedgerService,
    private readonly platformSettings: PlatformSettingsService,
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
    const cfg = await this.platformSettings.getMonitoringSettings();
    return {
      domain: sub.account!.domain,
      enabled: monitor?.enabled ?? false,
      notifyEmail: monitor?.notifyEmail ?? true,
      url: monitor?.url ?? `https://${sub.account!.domain}`,
      lastStatus: monitor?.lastStatus ?? 'UNKNOWN',
      lastCheckedAt: monitor?.lastCheckedAt?.toISOString() ?? null,
      lastHttpStatus: monitor?.lastHttpStatus ?? null,
      lastResponseMs: monitor?.lastResponseMs ?? null,
      lastError: monitor?.lastError ?? null,
      downSince: monitor?.downSince?.toISOString() ?? null,
      // MON-5 — wygasanie certyfikatu TLS.
      tlsExpiresAt: monitor?.tlsExpiresAt?.toISOString() ?? null,
      // MON-3 — stan i oferta płatnego tieru.
      paid: {
        active: monitor?.paidTier ?? false,
        cancelAtPeriodEnd: monitor?.paidCancelAtPeriodEnd ?? false,
        nextChargeAt: monitor?.paidNextChargeAt?.toISOString() ?? null,
        offered: cfg.paidOffered,
        monthlyPrice: cfg.paidMonthlyPrice,
        freeIntervalMinutes: cfg.freeIntervalMinutes,
        paidIntervalMinutes: cfg.paidIntervalMinutes,
      },
      // B3+ — uptime z ostatnich 30 dni (lub od początku monitorowania) z
      // realnych zdarzeń DOWN/RECOVERED. Uczciwie: okno nie sięga przed
      // utworzenie monitora, więc nie udajemy 100% za czas, gdy nie patrzyliśmy.
      uptime: monitor ? await this.computeUptimeWindow(monitor) : null,
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

  /**
   * Liczy dostępność (%) w oknie ostatnich `windowDays` dni na podstawie sumy
   * czasu awarii (zdarzenia RECOVERED z `durationS`) + ewentualnej trwającej
   * awarii (`downSince`). Okno przycinamy do momentu utworzenia monitora.
   */
  private async computeUptimeWindow(
    monitor: SiteMonitor,
    windowDays = 30,
  ): Promise<{
    pct: string;
    windowDays: number;
    sinceIso: string;
    downtimeSeconds: number;
    incidents: number;
    measuredFullWindow: boolean;
  }> {
    const now = Date.now();
    const fullWindowStart = now - windowDays * 24 * 60 * 60 * 1000;
    const windowStartMs = Math.max(fullWindowStart, monitor.createdAt.getTime());
    const windowSeconds = Math.max(1, Math.round((now - windowStartMs) / 1000));

    const recovered = await this.prisma.siteMonitorEvent.findMany({
      where: {
        monitorId: monitor.id,
        type: SiteMonitorEventType.RECOVERED,
        createdAt: { gte: new Date(windowStartMs) },
      },
      select: { durationS: true },
    });

    let downtimeSeconds = recovered.reduce((acc, e) => acc + (e.durationS ?? 0), 0);
    let incidents = recovered.length;

    // Trwająca awaria (jeszcze bez RECOVERED) — dolicz czas od downSince,
    // przycięty do początku okna.
    if (monitor.downSince) {
      const ongoingFrom = Math.max(monitor.downSince.getTime(), windowStartMs);
      downtimeSeconds += Math.max(0, Math.round((now - ongoingFrom) / 1000));
      incidents += 1;
    }

    downtimeSeconds = Math.min(downtimeSeconds, windowSeconds);
    const pctNum = Math.max(0, Math.min(100, (1 - downtimeSeconds / windowSeconds) * 100));

    return {
      pct: pctNum.toFixed(3),
      windowDays,
      sinceIso: new Date(windowStartMs).toISOString(),
      downtimeSeconds,
      incidents,
      measuredFullWindow: monitor.createdAt.getTime() <= fullWindowStart,
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

  /** MON-6 — przełącz e-mailowe powiadomienia o awarii/powrocie/SSL (bez ruszania monitoringu). */
  async setNotifyEmail(subscriptionId: string, userId: string, notifyEmail: boolean) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    await this.prisma.siteMonitor.upsert({
      where: { subscriptionId },
      create: {
        subscriptionId,
        enabled: true,
        url: `https://${sub.account!.domain}`,
        notifyEmail,
      },
      update: { notifyEmail },
    });
    await this.audit.record({
      action: notifyEmail ? 'SITE_MONITOR_NOTIFY_ON' : 'SITE_MONITOR_NOTIFY_OFF',
      userId,
      actorUserId: userId,
      details: { subscriptionId },
    });
    return this.statusForSubscription(subscriptionId, userId);
  }

  /**
   * MON-3 — włącz/wyłącz płatny monitoring (szybkie sprawdzanie). Rozliczany
   * miesięcznie z portfela. Włączenie pobiera pierwszą opłatę od razu; wyłączenie
   * zostawia szybki tier do końca opłaconego okresu (bez zwrotu).
   */
  async setPaidMonitoring(subscriptionId: string, userId: string, enabled: boolean) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const cfg = await this.platformSettings.getMonitoringSettings();
    const monitor = await this.prisma.siteMonitor.findUnique({ where: { subscriptionId } });

    if (enabled) {
      if (!cfg.paidOffered) {
        throw new BadRequestException('Płatny monitoring jest obecnie niedostępny.');
      }
      // Już aktywny i nie w trakcie anulowania — nic nie rób.
      if (monitor?.paidTier && !monitor.paidCancelAtPeriodEnd) {
        return this.statusForSubscription(subscriptionId, userId);
      }
      // Aktywny, ale oznaczony do anulowania — wznów bez ponownej opłaty.
      if (monitor?.paidTier && monitor.paidCancelAtPeriodEnd) {
        await this.prisma.siteMonitor.update({
          where: { subscriptionId },
          data: { paidCancelAtPeriodEnd: false },
        });
        await this.audit.record({
          action: 'SITE_MONITOR_PAID_RESUMED',
          userId,
          actorUserId: userId,
          details: { subscriptionId },
        });
        return this.statusForSubscription(subscriptionId, userId);
      }
      // Świeża aktywacja — pobierz pierwszą miesięczną opłatę z portfela.
      const price = new Prisma.Decimal(cfg.paidMonthlyPrice);
      if (price.greaterThan(0)) {
        try {
          await this.walletLedger.debit({
            userId,
            type: WalletTxType.CHARGE_USAGE,
            amount: price,
            description: `Płatny monitoring strony (${sub.account!.domain}) — 1 mies.`,
            idempotencyKey: `monitor-paid-${subscriptionId}-activate-${new Date()
              .toISOString()
              .slice(0, 10)}`,
            subscriptionId,
          });
        } catch {
          throw new BadRequestException(
            'Za mało środków w portfelu, aby włączyć płatny monitoring. Doładuj portfel i spróbuj ponownie.',
          );
        }
      }
      const now = new Date();
      const next = addOneMonth(now);
      const url = `https://${sub.account!.domain}`;
      await this.prisma.siteMonitor.upsert({
        where: { subscriptionId },
        create: {
          subscriptionId,
          enabled: true,
          url,
          paidTier: true,
          paidActivatedAt: now,
          paidNextChargeAt: next,
        },
        update: {
          enabled: true,
          paidTier: true,
          paidActivatedAt: now,
          paidNextChargeAt: next,
          paidCancelAtPeriodEnd: false,
        },
      });
      await this.audit.record({
        action: 'SITE_MONITOR_PAID_ENABLED',
        userId,
        actorUserId: userId,
        details: { subscriptionId, price: price.toFixed(2), nextChargeAt: next.toISOString() },
      });
    } else if (monitor?.paidTier) {
      // Wyłączenie — szybki tier zostaje do końca opłaconego okresu.
      await this.prisma.siteMonitor.update({
        where: { subscriptionId },
        data: { paidCancelAtPeriodEnd: true },
      });
      await this.audit.record({
        action: 'SITE_MONITOR_PAID_CANCEL_SCHEDULED',
        userId,
        actorUserId: userId,
        details: { subscriptionId, until: monitor.paidNextChargeAt?.toISOString() ?? null },
      });
    }

    return this.statusForSubscription(subscriptionId, userId);
  }

  // ---------------------------------------------------------------------------
  // MON-3 — miesięczne rozliczanie płatnego monitoringu
  // ---------------------------------------------------------------------------

  @Cron(CronExpression.EVERY_HOUR, { name: 'site-monitor-paid-billing' })
  async billPaidMonitors(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.siteMonitor.findMany({
      where: { paidTier: true, paidNextChargeAt: { lte: now } },
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
      take: 200,
    });
    if (due.length === 0) return;

    const cfg = await this.platformSettings.getMonitoringSettings();
    const price = new Prisma.Decimal(cfg.paidMonthlyPrice);

    for (const m of due) {
      const domain = m.subscription.account?.domain ?? 'strona';
      // Zaplanowane anulowanie — z końcem okresu wracamy do darmowego.
      if (m.paidCancelAtPeriodEnd) {
        await this.revertToFree(m.id);
        await this.audit.record({
          action: 'SITE_MONITOR_PAID_ENDED',
          userId: m.subscription.userId,
          details: { subscriptionId: m.subscriptionId, reason: 'cancelled' },
        });
        continue;
      }
      const periodKey = (m.paidNextChargeAt ?? now).toISOString().slice(0, 10);
      try {
        if (price.greaterThan(0)) {
          await this.walletLedger.debit({
            userId: m.subscription.userId,
            type: WalletTxType.CHARGE_USAGE,
            amount: price,
            description: `Płatny monitoring strony (${domain}) — 1 mies.`,
            idempotencyKey: `monitor-paid-${m.id}-${periodKey}`,
            subscriptionId: m.subscriptionId,
          });
        }
        await this.prisma.siteMonitor.update({
          where: { id: m.id },
          data: { paidNextChargeAt: addOneMonth(m.paidNextChargeAt ?? now) },
        });
      } catch (err) {
        // Tylko realny brak środków powoduje zejście do darmowego. Błędy
        // przejściowe (DB, lock) zostawiamy — spróbujemy ponownie za godzinę,
        // żeby nie obniżyć tieru przez chwilowy problem techniczny.
        if (!(err instanceof ConflictException)) {
          this.logger.error(
            `Błąd rozliczenia płatnego monitoringu sub=${m.subscriptionId} (ponowimy): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          continue;
        }
        // Brak środków → powrót do darmowego interwału (usługa NIE znika).
        await this.revertToFree(m.id);
        await this.audit.record({
          action: 'SITE_MONITOR_PAID_LAPSED',
          userId: m.subscription.userId,
          details: { subscriptionId: m.subscriptionId, reason: 'insufficient_funds' },
        });
        this.notifyPaidLapsed(m, domain, cfg);
        this.logger.warn(
          `Płatny monitoring dla sub=${m.subscriptionId} wrócił do darmowego — brak środków.`,
        );
      }
    }
  }

  private notifyPaidLapsed(
    monitor: {
      subscriptionId: string;
      subscription: {
        userId: string;
        user: { email: string; firstName: string | null; anonymizedAt: Date | null };
        account: { domain: string } | null;
      };
    },
    domain: string,
    cfg: { freeIntervalMinutes: number; paidIntervalMinutes: number; paidMonthlyPrice: number },
  ): void {
    const { user, userId } = monitor.subscription;
    if (!user || user.anonymizedAt) return;
    const panelUrl = this.panelUrl();
    const message = monitoringPaidLapsedTemplate({
      to: user.email,
      firstName: user.firstName,
      domain,
      freeIntervalMinutes: cfg.freeIntervalMinutes,
      paidIntervalMinutes: cfg.paidIntervalMinutes,
      monthlyPrice: cfg.paidMonthlyPrice,
      panelUrl,
      serviceUrl: `${panelUrl}/dashboard/services/${monitor.subscriptionId}`,
    });
    void this.mailer
      .send({ ...message, userId, category: 'TRANSACTIONAL', fromRole: 'BILLING' })
      .catch((err) => {
        this.logger.warn(
          `monitor paid-lapsed mail failed sub=${monitor.subscriptionId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }

  // ---------------------------------------------------------------------------
  // MON-5 — dzienne sprawdzanie wygasania certyfikatu TLS strony
  // ---------------------------------------------------------------------------

  @Cron('30 7 * * *', { name: 'site-monitor-ssl-expiry' })
  async checkSslExpiry(): Promise<void> {
    const monitors = await this.prisma.siteMonitor.findMany({
      where: { enabled: true, subscription: { status: SubscriptionStatus.ACTIVE } },
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
      take: 1000,
    });
    if (monitors.length === 0) return;

    let warned = 0;
    for (let i = 0; i < monitors.length; i += CONCURRENCY) {
      const batch = monitors.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (m) => {
          const domain = m.subscription.account?.domain;
          if (!domain) return;
          const expiresAt = await probeTlsExpiry(domain);
          if (!expiresAt) {
            await this.prisma.siteMonitor.update({
              where: { id: m.id },
              data: { tlsCheckedAt: new Date() },
            });
            return;
          }
          const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          const alreadyWarned =
            m.tlsExpiryNotifiedFor != null &&
            m.tlsExpiryNotifiedFor.getTime() === expiresAt.getTime();
          const shouldWarn = daysLeft <= SSL_WARN_DAYS && !alreadyWarned && m.notifyEmail;

          await this.prisma.siteMonitor.update({
            where: { id: m.id },
            data: {
              tlsExpiresAt: expiresAt,
              tlsCheckedAt: new Date(),
              ...(shouldWarn ? { tlsExpiryNotifiedFor: expiresAt } : {}),
            },
          });

          if (shouldWarn && m.subscription.user && !m.subscription.user.anonymizedAt) {
            warned += 1;
            const panelUrl = this.panelUrl();
            const message = sslExpiringTemplate({
              to: m.subscription.user.email,
              firstName: m.subscription.user.firstName,
              domain,
              expiresAt,
              daysLeft,
              panelUrl,
              serviceUrl: `${panelUrl}/dashboard/services/${m.subscriptionId}`,
            });
            void this.mailer
              .send({
                ...message,
                userId: m.subscription.userId,
                category: 'TRANSACTIONAL',
                fromRole: 'NOREPLY',
              })
              .catch((err) => {
                this.logger.warn(
                  `ssl-expiring mail failed sub=${m.subscriptionId}: ${
                    err instanceof Error ? err.message : String(err)
                  }`,
                );
              });
          }
        }),
      );
    }
    if (warned > 0) {
      this.logger.log(`SSL expiry sweep: ${monitors.length} sprawdzonych, ${warned} ostrzeżeń.`);
    }
  }

  private async revertToFree(monitorId: string): Promise<void> {
    await this.prisma.siteMonitor.update({
      where: { id: monitorId },
      data: {
        paidTier: false,
        paidNextChargeAt: null,
        paidActivatedAt: null,
        paidCancelAtPeriodEnd: false,
      },
    });
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
            priceAmount: true,
            user: { select: { email: true, firstName: true, anonymizedAt: true } },
            account: { select: { domain: true } },
          },
        },
      },
    });
    if (monitors.length === 0) return;

    // MON-2/MON-3 — tiering interwału: płatny monitoring (paidTier) sprawdzamy
    // często (interwał z ustawień admina), darmowy rzadziej. Cron budzi nas co
    // minutę — pomijamy monitor, jeśli od ostatniego sprawdzenia nie minął jego
    // interwał (z drobnym zapasem na jitter crona).
    const cfg = await this.platformSettings.getMonitoringSettings();
    const paidIntervalMs = cfg.paidIntervalMinutes * 60_000;
    const freeIntervalMs = cfg.freeIntervalMinutes * 60_000;
    const nowMs = Date.now();
    const due = monitors.filter((m) => {
      if (!m.lastCheckedAt) return true; // pierwszy strzał zawsze
      const intervalMs = m.paidTier ? paidIntervalMs : freeIntervalMs;
      return nowMs - m.lastCheckedAt.getTime() >= intervalMs - INTERVAL_SLACK_MS;
    });
    if (due.length === 0) return;

    const started = Date.now();
    let downs = 0;
    let recoveries = 0;

    // Bounded concurrency — a hung site must not stall the whole sweep.
    for (let i = 0; i < due.length; i += CONCURRENCY) {
      const batch = due.slice(i, i + CONCURRENCY);
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
        `Site monitor sweep: ${due.length}/${monitors.length} checked in ${Date.now() - started}ms ` +
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
          lastResponseMs: probe.responseMs ?? null,
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
    if (!monitor.notifyEmail) return;
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
    if (!monitor.notifyEmail) return;
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
): Promise<{ up: boolean; httpStatus?: number; responseMs?: number; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Verris-Monitor/1.0 (+https://verris.pl)' },
    });
    const responseMs = Date.now() - startedAt;
    if (res.status >= 500) {
      return { up: false, httpStatus: res.status, responseMs, reason: `HTTP ${res.status}` };
    }
    return { up: true, httpStatus: res.status, responseMs, reason: 'OK' };
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

/**
 * MON-5 — odczyt daty wygaśnięcia certyfikatu TLS przez handshake na :443.
 * `rejectUnauthorized:false` — chcemy odczytać też certy wygasłe/samopodpisane,
 * by móc o nich ostrzec. Zwraca null przy błędzie/timeout (brak certu do oceny).
 */
function probeTlsExpiry(domain: string): Promise<Date | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: Date | null) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* noop */
      }
      resolve(v);
    };
    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: false,
        timeout: TLS_PROBE_TIMEOUT_MS,
      },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_to) return done(null);
        const exp = new Date(cert.valid_to);
        done(Number.isNaN(exp.getTime()) ? null : exp);
      },
    );
    socket.on('timeout', () => done(null));
    socket.on('error', () => done(null));
  });
}

/** MON-3 — kolejny cykl miesięczny (zachowuje dzień, obsługuje krótsze miesiące). */
function addOneMonth(from: Date): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + 1);
  // Korekta przepełnienia (np. 31 → następny miesiąc bez 31 dnia).
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

function simplifyNetError(msg: string): string {
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'DNS nie odpowiada';
  if (/ECONNREFUSED/i.test(msg)) return 'połączenie odrzucone';
  if (/ECONNRESET/i.test(msg)) return 'połączenie zerwane';
  if (/certificate|TLS|SSL/i.test(msg)) return 'problem z certyfikatem SSL';
  return msg.slice(0, 120);
}
