import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as tls from 'node:tls';
import { PrismaService } from '../prisma/prisma.service';

const PROBE_TIMEOUT_MS = 8_000;
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;

export interface ComputedHealthSummary {
  score: number | null;
  label: 'healthy' | 'attention' | 'critical' | 'pending';
  checkedAt: string | null;
  checks: {
    dnsOk: boolean | null;
    tlsOk: boolean | null;
    backupFresh: boolean | null;
    lveOk: boolean | null;
    phpOk: boolean | null;
    mailOk: boolean | null;
  };
  summary: string;
}

@Injectable()
export class ServiceHealthService {
  private readonly logger = new Logger(ServiceHealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrRefreshForSubscription(
    subscriptionId: string,
    userId: string,
    opts?: { force?: boolean },
  ): Promise<ComputedHealthSummary> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: {
        account: { include: { server: true } },
        healthSnapshots: { orderBy: { computedAt: 'desc' }, take: 1 },
      },
    });
    if (!sub) throw new NotFoundException('Service not found');

    const latest = sub.healthSnapshots[0];
    const stale =
      !latest || Date.now() - latest.computedAt.getTime() > SNAPSHOT_MAX_AGE_MS;

    if (opts?.force || stale) {
      try {
        return await this.computeAndPersist(subscriptionId);
      } catch (err) {
        this.logger.warn(
          `Health compute failed sub=${subscriptionId}: ${(err as Error).message}`,
        );
      }
    }

    if (latest) return this.fromSnapshot(latest);
    return this.pendingSummary('Diagnostyka jeszcze nie została uruchomiona.');
  }

  async computeAndPersist(subscriptionId: string): Promise<ComputedHealthSummary> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { account: { include: { server: true } } },
    });
    if (!sub) throw new NotFoundException('Service not found');

    if (sub.status !== 'ACTIVE' || !sub.account) {
      const summary = this.pendingSummary(
        sub.status === 'PROVISIONING'
          ? 'Usługa jest w trakcie zakładania — health score pojawi się po aktywacji.'
          : 'Health score dostępny tylko dla aktywnej usługi z kontem hostingowym.',
      );
      return summary;
    }

    const account = sub.account;
    const server = account.server;
    const checks = {
      dnsOk: null as boolean | null,
      tlsOk: null as boolean | null,
      backupFresh: null as boolean | null,
      lveOk: null as boolean | null,
      phpOk: null as boolean | null,
      mailOk: null as boolean | null,
    };

    let earned = 0;
    let possible = 0;

    // Konto aktywne (15)
    possible += 15;
    if (account.status === 'ACTIVE') earned += 15;

    // DNS domeny klienta → IP węzła (25)
    possible += 25;
    try {
      const ips = await dns.resolve4(account.domain);
      checks.dnsOk = ips.includes(server.ipAddress);
      if (checks.dnsOk) earned += 25;
    } catch {
      checks.dnsOk = false;
    }

    // TLS :443 domeny klienta (15)
    possible += 15;
    const siteTls = await this.probeTls(account.domain, 443);
    checks.tlsOk = siteTls.ok && siteTls.authorized === true;
    if (checks.tlsOk) earned += 15;
    else if (siteTls.ok) earned += 5;

    // Panel DA (hostname węzła :2222) — cert zaufany (15)
    possible += 15;
    const panelHost = server.hostname ?? server.daHost ?? server.ipAddress;
    const panelTls = await this.probeTls(panelHost, server.daPort ?? 2222);
    checks.phpOk = panelTls.ok && panelTls.authorized === true;
    if (checks.phpOk) earned += 15;
    else if (panelTls.ok) earned += 5;

    // LVE / CPU z ostatniej metryki (20)
    possible += 20;
    const usage = await this.prisma.usageMetric.findFirst({
      where: { subscriptionId },
      orderBy: { bucketStart: 'desc' },
    });
    if (usage) {
      const limit = Math.max(1, account.cpuLimit);
      checks.lveOk = usage.cpuUsageAvg < limit * 0.92;
      if (checks.lveOk) earned += 20;
      else if (usage.cpuUsageAvg < limit) earned += 10;
    }

    // Backup — brak źródła LIVE na razie (10 rezerwowane, nie liczone)
    checks.backupFresh = null;

    const score = possible > 0 ? Math.round((earned / possible) * 100) : null;
    const label =
      score == null
        ? 'pending'
        : score >= 80
          ? 'healthy'
          : score >= 50
            ? 'attention'
            : 'critical';

    const summary = this.buildSummaryText(score, checks, account.domain);

    const snapshot = await this.prisma.serviceHealthSnapshot.create({
      data: {
        subscriptionId,
        score: score ?? 0,
        dnsOk: checks.dnsOk,
        tlsOk: checks.tlsOk,
        backupFresh: checks.backupFresh,
        lveOk: checks.lveOk,
        phpOk: checks.phpOk,
        mailOk: checks.mailOk,
        details: { summary, earned, possible, panelHost },
      },
    });

    return this.fromSnapshot(snapshot);
  }

  private fromSnapshot(row: {
    score: number;
    dnsOk: boolean | null;
    tlsOk: boolean | null;
    backupFresh: boolean | null;
    lveOk: boolean | null;
    phpOk: boolean | null;
    mailOk: boolean | null;
    computedAt: Date;
    details: unknown;
  }): ComputedHealthSummary {
    const details =
      row.details && typeof row.details === 'object' && !Array.isArray(row.details)
        ? (row.details as { summary?: string })
        : {};
    const score = row.score;
    return {
      score,
      label: score >= 80 ? 'healthy' : score >= 50 ? 'attention' : 'critical',
      checkedAt: row.computedAt.toISOString(),
      checks: {
        dnsOk: row.dnsOk,
        tlsOk: row.tlsOk,
        backupFresh: row.backupFresh,
        lveOk: row.lveOk,
        phpOk: row.phpOk,
        mailOk: row.mailOk,
      },
      summary: details.summary ?? 'Ostatnia diagnostyka zapisana.',
    };
  }

  private pendingSummary(text: string): ComputedHealthSummary {
    return {
      score: null,
      label: 'pending',
      checkedAt: null,
      checks: {
        dnsOk: null,
        tlsOk: null,
        backupFresh: null,
        lveOk: null,
        phpOk: null,
        mailOk: null,
      },
      summary: text,
    };
  }

  private buildSummaryText(
    score: number | null,
    checks: ComputedHealthSummary['checks'],
    domain: string,
  ): string {
    if (score == null) return 'Brak wystarczających danych do oceny.';
    const parts: string[] = [];
    if (checks.dnsOk === false) parts.push(`DNS domeny ${domain} nie wskazuje na serwer hostingu`);
    if (checks.tlsOk === false) parts.push('brak ważnego certyfikatu HTTPS na domenie');
    if (checks.phpOk === false) parts.push('panel hostingu wymaga uwagi');
    if (checks.lveOk === false) parts.push('wysokie obciążenie CPU');
    if (parts.length === 0) return 'Wszystkie sprawdzone parametry w normie.';
    return parts.join('; ') + '.';
  }

  private probeTls(
    hostname: string,
    port: number,
  ): Promise<{ ok: boolean; authorized?: boolean; error?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v: { ok: boolean; authorized?: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };

      const socket = tls.connect(
        { host: hostname, port, servername: hostname, rejectUnauthorized: true },
        () => {
          clearTimeout(timer);
          finish({ ok: true, authorized: socket.authorized });
          socket.end();
        },
      );

      const timer = setTimeout(() => {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        finish({ ok: false, error: 'timeout' });
      }, PROBE_TIMEOUT_MS);

      socket.on('error', (err) => {
        clearTimeout(timer);
        // Self-signed / brak cert — drugi pass z rejectUnauthorized: false
        const soft = tls.connect(
          { host: hostname, port, servername: hostname, rejectUnauthorized: false },
          () => {
            finish({ ok: true, authorized: false });
            soft.end();
          },
        );
        soft.on('error', () => finish({ ok: false, error: err.message }));
        soft.setTimeout(PROBE_TIMEOUT_MS, () => {
          soft.destroy();
          finish({ ok: false, error: err.message });
        });
      });
    });
  }
}
