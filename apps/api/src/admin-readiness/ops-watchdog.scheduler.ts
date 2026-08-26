import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Role, ServerStatus, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { AuditService } from '../common/audit/audit.service';
import { LiveReadinessService } from './live-readiness.service';
import {
  nodeOfflineAlertTemplate,
  nodeRecoveredTemplate,
  nodeCapacityAlertTemplate,
  opsDailyDigestTemplate,
} from '../mail/templates/ops-notifications';
import { BRAK_SYGNALU_MIN } from '../subscriptions/node-capacity';

// OPS-01: próg pochodzi z `node-capacity.ts`, żeby watchdog i selektor węzłów
// nie miały dwóch niezależnych zdań o tym, kiedy węzeł przestaje żyć.
const OFFLINE_AFTER_MS = BRAK_SYGNALU_MIN * 60 * 1000;
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // re-alert at most every 6h per node
const STALE_BACKUP_MS = 36 * 60 * 60 * 1000; // offsite backup older than 36h is stale
// OPS-3 — progi pojemności (alokacja planów / pojemność węzła).
const CAPACITY_WARN_PCT = 85; // alert do adminów
const CAPACITY_AUTO_CORDON_PCT = 95; // auto-cordon (gdy OPS_AUTO_CORDON=1)
const CAPACITY_ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000; // re-alert max co 12h/węzeł

/**
 * Proactive fleet protection for a LIVE platform:
 *  - every 5 min: nodes that stopped sending heartbeats → alert all admins
 *    (cooldown via audit), and notify recovery when they come back;
 *  - daily 08:00: go/no-go + fleet/services/domains digest to admins.
 *
 * De-dup uses the audit log (no schema change): NODE_OFFLINE_ALERT /
 * NODE_RECOVERED rows carry the serverId in details.
 */
@Injectable()
export class OpsWatchdogScheduler {
  private readonly logger = new Logger(OpsWatchdogScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly readiness: LiveReadinessService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (
      this.config.get<string>('adminPanelUrl') ??
      process.env.ADMIN_PANEL_URL ??
      'https://admin.verris.pl'
    ).replace(/\/$/, '');
  }

  private async admins(): Promise<Array<{ id: string; email: string; firstName: string | null }>> {
    return this.prisma.user.findMany({
      where: { role: Role.ADMIN, anonymizedAt: null },
      select: { id: true, email: true, firstName: true },
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkNodes(): Promise<void> {
    try {
      const now = Date.now();
      const servers = await this.prisma.server.findMany({
        where: { status: { in: [ServerStatus.ACTIVE, ServerStatus.MAINTENANCE] } },
        select: { id: true, name: true, hostname: true, lastHeartbeatAt: true },
      });

      // Recent alert/recovery audit rows for cooldown + recovery detection.
      const since = new Date(now - 25 * 60 * 60 * 1000);
      const recent = await this.prisma.auditLog.findMany({
        where: { action: { in: ['NODE_OFFLINE_ALERT', 'NODE_RECOVERED'] }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        select: { action: true, details: true, createdAt: true },
      });
      const lastFor = (serverId: string, action: string) =>
        recent.find(
          (r) =>
            r.action === action &&
            (r.details as { serverId?: string } | null)?.serverId === serverId,
        )?.createdAt ?? null;

      const admins = await this.admins();
      if (admins.length === 0) return;

      for (const s of servers) {
        const hb = s.lastHeartbeatAt?.getTime() ?? 0;
        const isOffline = now - hb > OFFLINE_AFTER_MS;
        const name = s.name ?? s.hostname ?? s.id;
        const lastAlert = lastFor(s.id, 'NODE_OFFLINE_ALERT');
        const lastRecovered = lastFor(s.id, 'NODE_RECOVERED');

        if (isOffline) {
          const onCooldown = lastAlert && now - lastAlert.getTime() < ALERT_COOLDOWN_MS;
          if (onCooldown) continue;
          await this.audit.record({ action: 'NODE_OFFLINE_ALERT', details: { serverId: s.id, name } });
          await this.fanOut(admins, (a) =>
            nodeOfflineAlertTemplate({
              to: a.email,
              firstName: a.firstName,
              nodeName: name,
              nodeId: s.id,
              lastSeenAt: s.lastHeartbeatAt,
              panelUrl: this.panelUrl(),
            }),
          );
          this.logger.warn(`Node offline alert sent: ${name} (${s.id})`);
        } else if (lastAlert && (!lastRecovered || lastRecovered < lastAlert)) {
          // Was alerted offline, now healthy and not yet acknowledged → recovery.
          await this.audit.record({ action: 'NODE_RECOVERED', details: { serverId: s.id, name } });
          await this.fanOut(admins, (a) =>
            nodeRecoveredTemplate({
              to: a.email,
              firstName: a.firstName,
              nodeName: name,
              nodeId: s.id,
              lastSeenAt: s.lastHeartbeatAt,
              panelUrl: this.panelUrl(),
            }),
          );
          this.logger.log(`Node recovered notice sent: ${name} (${s.id})`);
        }
      }
    } catch (err) {
      this.logger.error(`checkNodes failed: ${(err as Error).message}`);
    }
  }

  /**
   * OPS-3 — proaktywny alert pojemności. Co godzinę liczy obłożenie (alokacja
   * planów / pojemność) dla ACTIVE węzłów; gdy najwyższy wymiar przekroczy próg
   * — alert do adminów (cooldown 12h via audit). Gdy OPS_AUTO_CORDON=1 i ≥95% —
   * automatycznie ustawia cordon (istniejące konta działają, nowe nie trafiają).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkCapacity(): Promise<void> {
    try {
      const autoCordon = process.env.OPS_AUTO_CORDON === '1';
      const servers = await this.prisma.server.findMany({
        where: { status: ServerStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          hostname: true,
          totalCpuCores: true,
          totalMemoryMb: true,
          totalDiskMb: true,
          allocatedCpu: true,
          allocatedMemory: true,
          allocatedDisk: true,
          acceptsNewAccounts: true,
          maxAccounts: true,
        },
      });

      const accountCounts = await this.prisma.account.groupBy({
        by: ['serverId'],
        where: { serverId: { in: servers.map((s) => s.id) } },
        _count: { _all: true },
      });
      const countByServer = new Map<string, number>(
        accountCounts.map((row) => [row.serverId, row._count._all]),
      );

      const now = Date.now();
      const since = new Date(now - 25 * 60 * 60 * 1000);
      const recent = await this.prisma.auditLog.findMany({
        where: { action: 'NODE_CAPACITY_ALERT', createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        select: { details: true, createdAt: true },
      });
      const lastAlertFor = (serverId: string) =>
        recent.find((r) => (r.details as { serverId?: string } | null)?.serverId === serverId)
          ?.createdAt ?? null;

      const admins = await this.admins();

      for (const s of servers) {
        const totalCpu = (s.totalCpuCores ?? 0) * 100;
        const totalRam = s.totalMemoryMb ?? 0;
        const totalDisk = s.totalDiskMb ?? 0;
        if (totalCpu === 0 || totalRam === 0 || totalDisk === 0) continue;

        const cpuPct = Math.round((s.allocatedCpu / totalCpu) * 100);
        const ramPct = Math.round((s.allocatedMemory / totalRam) * 100);
        const diskPct = Math.round((s.allocatedDisk / totalDisk) * 100);
        const top = Math.max(cpuPct, ramPct, diskPct);
        if (top < CAPACITY_WARN_PCT) continue;

        // Auto-cordon (opcjonalny) — tylko gdy bardzo wysoko i jeszcze przyjmuje.
        let autoCordoned = false;
        if (autoCordon && top >= CAPACITY_AUTO_CORDON_PCT && s.acceptsNewAccounts) {
          await this.prisma.server.update({
            where: { id: s.id },
            data: { acceptsNewAccounts: false },
          });
          await this.audit.record({
            action: 'ADMIN_NODE_CAPACITY_POLICY_UPDATED',
            details: { serverId: s.id, changes: { acceptsNewAccounts: false }, auto: true, reason: `capacity ${top}%` },
          });
          autoCordoned = true;
          this.logger.warn(`Auto-cordon węzła ${s.name ?? s.id} przy ${top}% obłożenia`);
        }

        const last = lastAlertFor(s.id);
        const onCooldown = last && now - last.getTime() < CAPACITY_ALERT_COOLDOWN_MS;
        if (onCooldown && !autoCordoned) continue;
        if (admins.length === 0) continue;

        const name = s.name ?? s.hostname ?? s.id;
        await this.audit.record({
          action: 'NODE_CAPACITY_ALERT',
          details: { serverId: s.id, name, top, cpuPct, ramPct, diskPct, autoCordoned },
        });
        await this.fanOut(admins, (a) =>
          nodeCapacityAlertTemplate({
            to: a.email,
            firstName: a.firstName,
            nodeName: name,
            nodeId: s.id,
            topUtilizationPct: top,
            cpuPct,
            ramPct,
            diskPct,
            accounts: countByServer.get(s.id) ?? 0,
            maxAccounts: s.maxAccounts,
            autoCordoned,
            panelUrl: this.panelUrl(),
          }),
        );
        this.logger.warn(`Capacity alert sent: ${name} (${top}%)`);
      }
    } catch (err) {
      this.logger.error(`checkCapacity failed: ${(err as Error).message}`);
    }
  }

  @Cron('0 8 * * *')
  async dailyDigest(): Promise<void> {
    try {
      const admins = await this.admins();
      if (admins.length === 0) return;

      const report = await this.readiness.report();
      const now = Date.now();

      const [nodesActive, nodesOfflineRows, servicesActive, servicesPastDue, servicesSuspended, trialsEndingSoon, domainsExpiringSoon, backupRows] =
        await Promise.all([
          this.prisma.server.count({ where: { status: ServerStatus.ACTIVE } }),
          this.prisma.server.findMany({
            where: { status: { in: [ServerStatus.ACTIVE, ServerStatus.MAINTENANCE] } },
            select: { lastHeartbeatAt: true },
          }),
          this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
          this.prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
          this.prisma.subscription.count({ where: { status: SubscriptionStatus.SUSPENDED } }),
          this.prisma.subscription.count({
            where: {
              isTrial: true,
              status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PROVISIONING] },
              trialEndsAt: { gt: new Date(now), lte: new Date(now + 3 * 24 * 60 * 60 * 1000) },
            },
          }),
          this.prisma.domain.count({
            where: { expiresAt: { gt: new Date(now), lte: new Date(now + 30 * 24 * 60 * 60 * 1000) } },
          }),
          this.prisma.server.findMany({
            where: { status: ServerStatus.ACTIVE },
            select: { lastOffsiteBackupAt: true, lastOffsiteBackupOk: true },
          }),
        ]);

      const nodesOffline = nodesOfflineRows.filter(
        (s) => now - (s.lastHeartbeatAt?.getTime() ?? 0) > OFFLINE_AFTER_MS,
      ).length;
      const nodesBackupStale = backupRows.filter(
        (s) => !s.lastOffsiteBackupOk || now - (s.lastOffsiteBackupAt?.getTime() ?? 0) > STALE_BACKUP_MS,
      ).length;

      const fails = report.checks.filter((c) => c.status === 'fail').map((c) => c.label);
      const warns = report.checks.filter((c) => c.status === 'warn').map((c) => c.label);

      await this.fanOut(admins, (a) =>
        opsDailyDigestTemplate({
          to: a.email,
          firstName: a.firstName,
          go: report.go,
          readinessFails: fails,
          readinessWarns: warns,
          nodesActive,
          nodesOffline,
          nodesBackupStale,
          servicesActive,
          servicesPastDue,
          servicesSuspended,
          trialsEndingSoon,
          domainsExpiringSoon,
          panelUrl: this.panelUrl(),
        }),
      );
      this.logger.log(`Daily ops digest sent to ${admins.length} admin(s) (GO=${report.go})`);
    } catch (err) {
      this.logger.error(`dailyDigest failed: ${(err as Error).message}`);
    }
  }

  private async fanOut(
    admins: Array<{ id: string; email: string; firstName: string | null }>,
    build: (a: { id: string; email: string; firstName: string | null }) => ReturnType<typeof opsDailyDigestTemplate>,
  ): Promise<void> {
    await Promise.all(
      admins.map((a) =>
        this.mailer
          .send({ ...build(a), userId: a.id, category: 'TRANSACTIONAL', fromRole: 'SECURITY' })
          .catch((err) => this.logger.warn(`ops mail to ${a.email} failed: ${(err as Error).message}`)),
      ),
    );
  }
}
