import { Injectable, Logger } from '@nestjs/common';
import {
  AccountStatus,
  IncidentStatus,
  ServerStatus,
  SubscriptionStatus,
  WalletTxType,
} from '@ekohost/database';
import { PrismaService } from '../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

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
      'ekohost_subscriptions_total',
      'Number of subscriptions per status',
      'gauge',
    );
    for (const status of Object.values(SubscriptionStatus)) {
      const value = subsByStatus.find((r) => r.status === status)?._count._all ?? 0;
      lines.push(`ekohost_subscriptions_total{status="${status}"} ${value}`);
    }

    // --- Servers (compute fleet) -----------------------------------------
    const serversByStatus = await this.prisma.server.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    write(lines, 'ekohost_servers_total', 'Number of compute nodes per status', 'gauge');
    for (const status of Object.values(ServerStatus)) {
      const value = serversByStatus.find((r) => r.status === status)?._count._all ?? 0;
      lines.push(`ekohost_servers_total{status="${status}"} ${value}`);
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
      'ekohost_servers_stale_heartbeat',
      'Active servers without a heartbeat in the last 5 minutes',
      'gauge',
    );
    lines.push(`ekohost_servers_stale_heartbeat ${staleHeartbeats}`);

    // --- Accounts (provisioned hosting accounts) -------------------------
    const accountsByStatus = await this.prisma.account.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    write(
      lines,
      'ekohost_accounts_total',
      'Number of provisioned hosting accounts per status',
      'gauge',
    );
    for (const status of Object.values(AccountStatus)) {
      const value = accountsByStatus.find((r) => r.status === status)?._count._all ?? 0;
      lines.push(`ekohost_accounts_total{status="${status}"} ${value}`);
    }

    // --- Wallet flows (last 30 days, in PLN) -----------------------------
    const walletAgg = await this.prisma.walletTransaction.groupBy({
      by: ['type'],
      where: { createdAt: { gte: since30d } },
      _sum: { amount: true },
    });
    write(
      lines,
      'ekohost_wallet_amount_30d_pln',
      'Sum of wallet transactions over the last 30 days, by type, in PLN',
      'gauge',
    );
    for (const type of Object.values(WalletTxType)) {
      const sum = walletAgg.find((r) => r.type === type)?._sum.amount;
      const value = sum ? Number(sum.toString()) : 0;
      lines.push(`ekohost_wallet_amount_30d_pln{type="${type}"} ${value.toFixed(2)}`);
    }

    // --- Stripe webhook health (proxy: invoices created last 24 h) -------
    const invoices24h = await this.prisma.invoice.count({
      where: { createdAt: { gte: since24h } },
    });
    write(
      lines,
      'ekohost_invoices_24h_total',
      'Invoices mirrored from Stripe webhooks in the last 24 hours',
      'gauge',
    );
    lines.push(`ekohost_invoices_24h_total ${invoices24h}`);

    // --- Autoscaling (last hour activity) --------------------------------
    const autoscaleEventsLastHour = await this.prisma.autoscalingEvent.count({
      where: { createdAt: { gte: since1h } },
    });
    write(
      lines,
      'ekohost_autoscale_events_1h_total',
      'Autoscaling events (UP/DOWN/DISABLED) in the last hour',
      'gauge',
    );
    lines.push(`ekohost_autoscale_events_1h_total ${autoscaleEventsLastHour}`);

    // --- Probes / incidents ----------------------------------------------
    const probesByEnabled = await this.prisma.serviceProbe.groupBy({
      by: ['isEnabled'],
      _count: { _all: true },
    });
    write(lines, 'ekohost_probes_total', 'Status probes configured per enabled flag', 'gauge');
    for (const row of probesByEnabled) {
      lines.push(
        `ekohost_probes_total{enabled="${row.isEnabled}"} ${row._count._all}`,
      );
    }

    const openIncidentsBySeverity = await this.prisma.probeIncident.groupBy({
      by: ['severity'],
      where: { status: IncidentStatus.OPEN },
      _count: { _all: true },
    });
    write(
      lines,
      'ekohost_incidents_open',
      'Currently open probe incidents by severity',
      'gauge',
    );
    for (const sev of ['MAJOR', 'MINOR'] as const) {
      const value =
        openIncidentsBySeverity.find((r) => r.severity === sev)?._count._all ?? 0;
      lines.push(`ekohost_incidents_open{severity="${sev}"} ${value}`);
    }

    // --- Provisioning queue depth (sync today; B-7 BullMQ later) ---------
    const pendingProvision = await this.prisma.subscription.count({
      where: { status: SubscriptionStatus.PROVISIONING },
    });
    write(
      lines,
      'ekohost_provisioning_pending',
      'Subscriptions stuck in PROVISIONING — proxy for queue depth',
      'gauge',
    );
    lines.push(`ekohost_provisioning_pending ${pendingProvision}`);

    // --- Process-level info ----------------------------------------------
    const mem = process.memoryUsage();
    write(
      lines,
      'ekohost_process_memory_bytes',
      'API process memory usage (Node.js process.memoryUsage)',
      'gauge',
    );
    lines.push(`ekohost_process_memory_bytes{kind="rss"} ${mem.rss}`);
    lines.push(`ekohost_process_memory_bytes{kind="heap_used"} ${mem.heapUsed}`);
    lines.push(`ekohost_process_memory_bytes{kind="heap_total"} ${mem.heapTotal}`);

    write(
      lines,
      'ekohost_process_uptime_seconds',
      'API process uptime in seconds',
      'counter',
    );
    lines.push(`ekohost_process_uptime_seconds ${Math.round(process.uptime())}`);

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
