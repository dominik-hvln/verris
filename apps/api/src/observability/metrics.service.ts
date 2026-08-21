import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AccountStatus,
  IncidentStatus,
  Prisma,
  Role,
  ServerStatus,
  SubscriptionStatus,
  WalletTxType,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { ProvisioningQueueService } from '../subscriptions/provisioning-queue.service';
import { HttpMetricsService } from './http-metrics.service';
import { RuntimeErrorTracker } from './runtime-error-tracker.service';

/**
 * F-13: produces a Prometheus text-format metrics snapshot. We emit a small,
 * curated set of business+ops gauges/counters — enough to power the four
 * dashboards (control-plane health, fleet, LVE, business) without leaking
 * any PII or secrets.
 *
 * Implementation notes:
 *  - Pure SQL; no external Prometheus client library (keeps the API image
 *    lean and avoids the registry-singleton rituals that come with one).
 *  - Snapshot is built per-scrape (`groupBy` queries), not from in-memory
 *    counters. With our scale (low thousands of subs, ~10s of nodes) this
 *    is fast enough and trivially correct after restarts.
 *  - Output format: https://prometheus.io/docs/instrumenting/exposition_formats/#text-format-details
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  // Cache for 5 s — Prometheus default scrape interval is 15 s, so the cache
  // hides a tiny amount of inter-scrape work without measurable staleness.
  private cached: { at: number; body: string } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly httpMetrics?: HttpMetricsService,
    @Optional() private readonly provisioningQueue?: ProvisioningQueueService,
    @Optional() private readonly objectStorage?: ObjectStorageService,
    @Optional() private readonly runtimeErrors?: RuntimeErrorTracker,
  ) {}

  async getPrometheusMetrics(): Promise<string> {
    if (this.cached && Date.now() - this.cached.at < 5_000) {
      return this.cached.body;
    }
    const body = await this.collect();
    this.cached = { at: Date.now(), body };
    return body;
  }

  private async collect(): Promise<string> {
    const lines: string[] = [];
    const now = Date.now();
    const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since1h = new Date(now - 60 * 60 * 1000);

    // --- Subscriptions ----------------------------------------------------
    const subsByStatus = await this.prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    write(
      lines,
      'verris_subscriptions_total',
      'Number of subscriptions per status',
      'gauge',
    );
    for (const status of Object.values(SubscriptionStatus)) {
      const value = subsByStatus.find((r) => r.status === status)?._count._all ?? 0;
      lines.push(`verris_subscriptions_total{status="${status}"} ${value}`);
    }

    // --- Servers (compute fleet) -----------------------------------------
    const serversByStatus = await this.prisma.server.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    write(lines, 'verris_servers_total', 'Number of compute nodes per status', 'gauge');
    for (const status of Object.values(ServerStatus)) {
      const value = serversByStatus.find((r) => r.status === status)?._count._all ?? 0;
      lines.push(`verris_servers_total{status="${status}"} ${value}`);
    }

    const staleHeartbeats = await this.prisma.server.count({
      where: {
        status: ServerStatus.ACTIVE,
        OR: [
          { lastHeartbeatAt: null },
          { lastHeartbeatAt: { lt: new Date(now - 5 * 60 * 1000) } },
        ],
      },
    });
    write(
      lines,
      'verris_servers_stale_heartbeat',
      'Active servers without a heartbeat in the last 5 minutes',
      'gauge',
    );
    lines.push(`verris_servers_stale_heartbeat ${staleHeartbeats}`);

    // --- Users (non-anonymized) ----------------------------------------
    const usersByRole = await this.prisma.user.groupBy({
      by: ['role'],
      where: { anonymizedAt: null },
      _count: { _all: true },
    });
    write(lines, 'verris_users_total', 'Registered users by role (non-anonymized)', 'gauge');
    for (const role of Object.values(Role)) {
      const value = usersByRole.find((r) => r.role === role)?._count._all ?? 0;
      lines.push(`verris_users_total{role="${role}"} ${value}`);
    }

    // --- Support tickets --------------------------------------------------
    const ticketsByStatus = await this.prisma.ticket.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    write(lines, 'verris_tickets_total', 'Support tickets by status', 'gauge');
    for (const row of ticketsByStatus) {
      lines.push(`verris_tickets_total{status="${row.status}"} ${row._count._all}`);
    }

    const awaitingFirstResponse = await this.prisma.ticket.count({
      where: {
        firstResponseAt: null,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
    });
    write(
      lines,
      'verris_tickets_awaiting_first_response_total',
      'Open tickets without a staff first response yet',
      'gauge',
    );
    lines.push(`verris_tickets_awaiting_first_response_total ${awaitingFirstResponse}`);

    const [
      staffResponseAvgSeconds,
      staffResponseAvgSeconds30d,
      firstResponseAvgSeconds,
      firstResponseAvgSeconds30d,
    ] = await Promise.all([
      this.avgStaffResponseSeconds(),
      this.avgStaffResponseSeconds(since30d),
      this.avgFirstResponseSeconds(),
      this.avgFirstResponseSeconds(since30d),
    ]);
    write(
      lines,
      'verris_ticket_staff_response_avg_seconds',
      'Average seconds from client message to staff reply (all time)',
      'gauge',
    );
    lines.push(
      `verris_ticket_staff_response_avg_seconds ${formatMetricSeconds(staffResponseAvgSeconds)}`,
    );
    write(
      lines,
      'verris_ticket_staff_response_avg_seconds_30d',
      'Average seconds from client message to staff reply (staff replies in last 30 days)',
      'gauge',
    );
    lines.push(
      `verris_ticket_staff_response_avg_seconds_30d ${formatMetricSeconds(staffResponseAvgSeconds30d)}`,
    );
    write(
      lines,
      'verris_ticket_first_response_avg_seconds',
      'Average time to first staff response (createdAt → firstResponseAt, all time)',
      'gauge',
    );
    lines.push(
      `verris_ticket_first_response_avg_seconds ${formatMetricSeconds(firstResponseAvgSeconds)}`,
    );
    write(
      lines,
      'verris_ticket_first_response_avg_seconds_30d',
      'Average time to first staff response for tickets created in the last 30 days',
      'gauge',
    );
    lines.push(
      `verris_ticket_first_response_avg_seconds_30d ${formatMetricSeconds(firstResponseAvgSeconds30d)}`,
    );

    // --- Control-plane mailboxes -----------------------------------------
    const mailboxesByStatus = await this.prisma.controlPlaneMailbox.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    write(
      lines,
      'verris_mailboxes_total',
      'Team mailboxes (@verris.pl) by status',
      'gauge',
    );
    for (const row of mailboxesByStatus) {
      lines.push(`verris_mailboxes_total{status="${row.status}"} ${row._count._all}`);
    }

    const mailboxUsedBytes = await this.prisma.controlPlaneMailbox.aggregate({
      _sum: { usedBytes: true },
    });
    write(
      lines,
      'verris_mailboxes_used_bytes_total',
      'Sum of reported mailbox used bytes on control-plane',
      'gauge',
    );
    lines.push(
      `verris_mailboxes_used_bytes_total ${Number(mailboxUsedBytes._sum.usedBytes ?? 0n)}`,
    );

    // --- Email delivery (24h) --------------------------------------------
    const emailByStatus24h = await this.prisma.emailLog.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
    });
    write(
      lines,
      'verris_email_log_24h_total',
      'Outbound email log entries in the last 24 hours by status',
      'gauge',
    );
    for (const row of emailByStatus24h) {
      lines.push(`verris_email_log_24h_total{status="${row.status}"} ${row._count._all}`);
    }

    // --- Accounts (provisioned hosting accounts) -------------------------
    const accountsByStatus = await this.prisma.account.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    write(
      lines,
      'verris_accounts_total',
      'Number of provisioned hosting accounts per status',
      'gauge',
    );
    for (const status of Object.values(AccountStatus)) {
      const value = accountsByStatus.find((r) => r.status === status)?._count._all ?? 0;
      lines.push(`verris_accounts_total{status="${status}"} ${value}`);
    }

    // --- Wallet flows (last 30 days, in PLN) -----------------------------
    const walletAgg = await this.prisma.walletTransaction.groupBy({
      by: ['type'],
      where: { createdAt: { gte: since30d } },
      _sum: { amount: true },
    });
    write(
      lines,
      'verris_wallet_amount_30d_pln',
      'Sum of wallet transactions over the last 30 days, by type, in PLN',
      'gauge',
    );
    for (const type of Object.values(WalletTxType)) {
      const sum = walletAgg.find((r) => r.type === type)?._sum.amount;
      const value = sum ? Number(sum.toString()) : 0;
      lines.push(`verris_wallet_amount_30d_pln{type="${type}"} ${value.toFixed(2)}`);
    }

    // --- Stripe webhook health (proxy: invoices created last 24 h) -------
    const invoices24h = await this.prisma.invoice.count({
      where: { createdAt: { gte: since24h } },
    });
    write(
      lines,
      'verris_invoices_24h_total',
      'Invoices mirrored from Stripe webhooks in the last 24 hours',
      'gauge',
    );
    lines.push(`verris_invoices_24h_total ${invoices24h}`);

    // --- Autoscaling (last hour activity) --------------------------------
    const autoscaleEventsLastHour = await this.prisma.autoscalingEvent.count({
      where: { createdAt: { gte: since1h } },
    });
    write(
      lines,
      'verris_autoscale_events_1h_total',
      'Autoscaling events (UP/DOWN/DISABLED) in the last hour',
      'gauge',
    );
    lines.push(`verris_autoscale_events_1h_total ${autoscaleEventsLastHour}`);

    const autoscaleEvents30d = await this.prisma.autoscalingEvent.groupBy({
      by: ['resource', 'direction'],
      where: {
        createdAt: { gte: since30d },
        resource: { not: null },
      },
      _count: { _all: true },
    });
    write(
      lines,
      'verris_autoscaling_scale_events_total',
      'Autoscaling scale events in the last 30 days by resource and direction',
      'gauge',
    );
    for (const row of autoscaleEvents30d) {
      const resource = row.resource ?? 'unknown';
      lines.push(
        `verris_autoscaling_scale_events_total{resource="${resource}",direction="${row.direction}"} ${row._count._all}`,
      );
    }

    const autoscaleCharges30d = await this.prisma.walletTransaction.findMany({
      where: {
        type: WalletTxType.CHARGE_AUTOSCALING,
        status: 'COMPLETED',
        createdAt: { gte: since30d },
      },
      select: { amount: true, metadata: true },
    });
    const chargeByResource = { CPU: 0, RAM: 0, DISK: 0, legacy: 0 };
    for (const tx of autoscaleCharges30d) {
      const abs = Math.abs(Number(tx.amount.toString()));
      const meta = tx.metadata as Record<string, unknown> | null;
      if (meta?.revenueCpuPln != null) {
        chargeByResource.CPU += Number(meta.revenueCpuPln);
        chargeByResource.RAM += Number(meta.revenueRamPln ?? 0);
        chargeByResource.DISK += Number(meta.revenueDiskPln ?? 0);
      } else {
        chargeByResource.legacy += abs;
      }
    }
    write(
      lines,
      'verris_autoscaling_charges_pln_30d',
      'Autoscaling wallet charges in the last 30 days by resource (PLN)',
      'gauge',
    );
    for (const resource of ['CPU', 'RAM', 'DISK'] as const) {
      lines.push(
        `verris_autoscaling_charges_pln_30d{resource="${resource}"} ${chargeByResource[resource].toFixed(2)}`,
      );
    }
    lines.push(
      `verris_autoscaling_charges_pln_30d{resource="legacy_unallocated"} ${chargeByResource.legacy.toFixed(2)}`,
    );

    // --- Plan changes (PC-3.4) -------------------------------------------
    const planChangeEvents = await this.prisma.subscriptionEvent.findMany({
      where: { type: 'PLAN_CHANGED', createdAt: { gte: since30d } },
      select: { details: true },
    });
    const planChangeCounts = { upgrade: 0, downgrade: 0, none: 0 };
    for (const row of planChangeEvents) {
      const details = row.details as { direction?: string } | null;
      const dir = details?.direction;
      if (dir === 'upgrade' || dir === 'downgrade' || dir === 'none') {
        planChangeCounts[dir] += 1;
      }
    }
    write(
      lines,
      'verris_plan_changes_total',
      'Subscription plan changes in the last 30 days by proration direction',
      'gauge',
    );
    for (const direction of ['upgrade', 'downgrade', 'none'] as const) {
      lines.push(`verris_plan_changes_total{direction="${direction}"} ${planChangeCounts[direction]}`);
    }

    // --- Probes / incidents ----------------------------------------------
    const probesByEnabled = await this.prisma.serviceProbe.groupBy({
      by: ['isEnabled'],
      _count: { _all: true },
    });
    write(lines, 'verris_probes_total', 'Status probes configured per enabled flag', 'gauge');
    for (const row of probesByEnabled) {
      lines.push(
        `verris_probes_total{enabled="${row.isEnabled}"} ${row._count._all}`,
      );
    }

    const openIncidentsBySeverity = await this.prisma.probeIncident.groupBy({
      by: ['severity'],
      where: { status: IncidentStatus.OPEN },
      _count: { _all: true },
    });
    write(
      lines,
      'verris_incidents_open',
      'Currently open probe incidents by severity',
      'gauge',
    );
    for (const sev of ['MAJOR', 'MINOR'] as const) {
      const value =
        openIncidentsBySeverity.find((r) => r.severity === sev)?._count._all ?? 0;
      lines.push(`verris_incidents_open{severity="${sev}"} ${value}`);
    }

    // --- Provisioning queue depth + per-stage status -----------------------
    const pendingProvision = await this.prisma.subscription.count({
      where: { status: SubscriptionStatus.PROVISIONING },
    });
    write(
      lines,
      'verris_provisioning_pending',
      'Subscriptions stuck in PROVISIONING — proxy for queue depth',
      'gauge',
    );
    lines.push(`verris_provisioning_pending ${pendingProvision}`);

    // Per-stage breakdown widoczny dla klienta.
    const stageRows = await this.prisma.subscription.groupBy({
      by: ['provisioningStage'],
      _count: { _all: true },
      where: { provisioningStage: { not: null } },
    });
    write(
      lines,
      'verris_provisioning_stage_total',
      'Subscriptions by current provisioning stage (queued/running/retrying/failed/completed)',
      'gauge',
    );
    for (const row of stageRows) {
      const stage = row.provisioningStage ?? 'unknown';
      lines.push(`verris_provisioning_stage_total{stage="${stage}"} ${row._count._all}`);
    }

    if (this.provisioningQueue && this.provisioningQueue.isAsync()) {
      try {
        const queueMetrics = await this.provisioningQueue.getQueueMetrics();
        write(
          lines,
          'verris_provisioning_queue_depth',
          'BullMQ queue depth by state (active/waiting/delayed/failed/completed/paused)',
          'gauge',
        );
        for (const [state, value] of Object.entries(queueMetrics.counts)) {
          lines.push(`verris_provisioning_queue_depth{state="${state}"} ${value}`);
        }
        write(
          lines,
          'verris_provisioning_jobs_total',
          'Cumulative count of provisioning jobs by lifecycle event',
          'counter',
        );
        for (const [event, value] of Object.entries(queueMetrics.process)) {
          lines.push(`verris_provisioning_jobs_total{event="${event}"} ${value}`);
        }
        write(
          lines,
          'verris_provisioning_queue_oldest_waiting_seconds',
          'Age of the oldest waiting or delayed provisioning job',
          'gauge',
        );
        lines.push(
          `verris_provisioning_queue_oldest_waiting_seconds ${queueMetrics.oldestWaitingAgeSeconds}`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to collect provisioning queue metrics: ${(err as Error).message}`,
        );
      }
    }

    // --- Postgres backup w MinIO (latest.sql.gz) ---------------------------
    if (this.objectStorage) {
      try {
        const backup = await this.objectStorage.getPostgresBackupLatestStat();
        write(
          lines,
          'verris_backup_present',
          '1 if postgres/latest.sql.gz exists in S3_BUCKET_BACKUPS',
          'gauge',
        );
        lines.push(`verris_backup_present ${backup ? 1 : 0}`);
        write(
          lines,
          'verris_backup_latest_age_seconds',
          'Seconds since last successful MinIO backup object was modified',
          'gauge',
        );
        write(
          lines,
          'verris_backup_latest_size_bytes',
          'Size of postgres/latest.sql.gz in MinIO',
          'gauge',
        );
        write(
          lines,
          'verris_backup_latest_timestamp_seconds',
          'Unix timestamp of postgres/latest.sql.gz Last-Modified',
          'gauge',
        );
        if (backup) {
          lines.push(`verris_backup_latest_age_seconds ${backup.ageSeconds}`);
          lines.push(`verris_backup_latest_size_bytes ${backup.sizeBytes}`);
          lines.push(
            `verris_backup_latest_timestamp_seconds ${backup.lastModifiedUnix}`,
          );
        } else {
          lines.push('verris_backup_latest_age_seconds 0');
          lines.push('verris_backup_latest_size_bytes 0');
          lines.push('verris_backup_latest_timestamp_seconds 0');
        }
      } catch (err) {
        this.logger.warn(
          `Backup metrics skipped: ${(err as Error).message}`,
        );
      }
    }

    // --- Migration worker jobs (failed backlog) ---------------------------
    const failedMigrationJobs = await this.prisma.migrationWorkerJob.count({
      where: { status: 'FAILED' },
    });
    write(
      lines,
      'verris_migration_worker_jobs_failed',
      'Migration worker jobs in FAILED status',
      'gauge',
    );
    lines.push(`verris_migration_worker_jobs_failed ${failedMigrationJobs}`);

    // --- Status webhook delivery health ----------------------------------
    const webhookDeliveriesByStatus = await this.prisma.statusWebhookDelivery.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    write(
      lines,
      'verris_status_webhook_deliveries_total',
      'Status webhook deliveries by current delivery status',
      'gauge',
    );
    for (const row of webhookDeliveriesByStatus) {
      lines.push(`verris_status_webhook_deliveries_total{status="${row.status}"} ${row._count._all}`);
    }
    const oldestWebhookDelivery = await this.prisma.statusWebhookDelivery.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    write(
      lines,
      'verris_status_webhook_oldest_pending_seconds',
      'Age of the oldest pending status webhook delivery',
      'gauge',
    );
    lines.push(
      `verris_status_webhook_oldest_pending_seconds ${
        oldestWebhookDelivery
          ? Math.max(0, Math.floor((Date.now() - oldestWebhookDelivery.createdAt.getTime()) / 1000))
          : 0
      }`,
    );

    // --- Process-level info ----------------------------------------------
    const mem = process.memoryUsage();
    write(
      lines,
      'verris_process_memory_bytes',
      'API process memory usage (Node.js process.memoryUsage)',
      'gauge',
    );
    lines.push(`verris_process_memory_bytes{kind="rss"} ${mem.rss}`);
    lines.push(`verris_process_memory_bytes{kind="heap_used"} ${mem.heapUsed}`);
    lines.push(`verris_process_memory_bytes{kind="heap_total"} ${mem.heapTotal}`);

    write(
      lines,
      'verris_process_uptime_seconds',
      'API process uptime in seconds',
      'counter',
    );
    lines.push(`verris_process_uptime_seconds ${Math.round(process.uptime())}`);

    // --- Runtime errors (CYBER-9) ----------------------------------------
    if (this.runtimeErrors) {
      lines.push(...this.runtimeErrors.prometheusLines());
    }

    if (this.httpMetrics) {
      const httpBody = this.httpMetrics.formatPrometheus();
      if (httpBody) lines.push(httpBody.trimEnd());
    }

    return lines.join('\n') + '\n';
  }

  /** Średni czas od wiadomości klienta do odpowiedzi staff (wątek ticketu). */
  private async avgStaffResponseSeconds(since?: Date): Promise<number | null> {
    const sinceFilter = since
      ? Prisma.sql`AND resp.ts >= ${since}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ avg_seconds: number | null }>>`
      WITH timeline AS (
        SELECT t.id AS ticket_id, t."createdAt" AS ts, 'client'::text AS side
        FROM "Ticket" t
        UNION ALL
        SELECT r."ticketId", r."createdAt",
          CASE WHEN r."isStaff" THEN 'staff' ELSE 'client' END
        FROM "TicketReply" r
      ),
      responses AS (
        SELECT
          ticket_id,
          ts,
          side,
          LAG(ts) OVER (PARTITION BY ticket_id ORDER BY ts) AS prev_ts,
          LAG(side) OVER (PARTITION BY ticket_id ORDER BY ts) AS prev_side
        FROM timeline
      )
      SELECT AVG(EXTRACT(EPOCH FROM (resp.ts - resp.prev_ts)))::float AS avg_seconds
      FROM responses resp
      WHERE resp.side = 'staff'
        AND resp.prev_side = 'client'
        AND resp.prev_ts IS NOT NULL
        ${sinceFilter}
    `;
    return rows[0]?.avg_seconds ?? null;
  }

  /** Średni czas do pierwszej odpowiedzi staff (TTFR). */
  private async avgFirstResponseSeconds(since?: Date): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<Array<{ avg_seconds: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM (t."firstResponseAt" - t."createdAt")))::float AS avg_seconds
      FROM "Ticket" t
      WHERE t."firstResponseAt" IS NOT NULL
      ${since ? Prisma.sql`AND t."createdAt" >= ${since}` : Prisma.empty}
    `;
    return rows[0]?.avg_seconds ?? null;
  }
}

function write(
  lines: string[],
  name: string,
  help: string,
  type: 'gauge' | 'counter',
): void {
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} ${type}`);
}

function formatMetricSeconds(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return Math.max(0, value).toFixed(3);
}
