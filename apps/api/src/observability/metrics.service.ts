import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AccountStatus,
  IncidentStatus,
  ServerStatus,
  SubscriptionStatus,
  WalletTxType,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { ProvisioningQueueService } from '../subscriptions/provisioning-queue.service';

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
    @Optional() private readonly provisioningQueue?: ProvisioningQueueService,
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

    return lines.join('\n') + '\n';
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
