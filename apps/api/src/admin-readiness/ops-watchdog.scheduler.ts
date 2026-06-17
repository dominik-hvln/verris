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
  opsDailyDigestTemplate,
} from '../mail/templates/ops-notifications';

const OFFLINE_AFTER_MS = 10 * 60 * 1000; // no heartbeat for 10 min => offline
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // re-alert at most every 6h per node
const STALE_BACKUP_MS = 36 * 60 * 60 * 1000; // offsite backup older than 36h is stale

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
