import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import type { ServiceHealthCheckDetailDto, ServiceHealthCheckKey } from '@verris/contracts';
import * as dns from 'node:dns/promises';
import * as tls from 'node:tls';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from '../servers/directadmin.service';
import {
  buildHealthCheckDetails,
  fallbackHealthCheckDetails,
  type HealthProbeMeta,
} from './service-health-hints';

const PROBE_TIMEOUT_MS = 8_000;
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;
/** A backup counts as "fresh" if it's no older than this (covers weekly EKO + buffer). */
const BACKUP_FRESH_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

export interface ComputedHealthSummary {
  score: number | null;
  label: 'healthy' | 'attention' | 'critical' | 'pending';
  checkedAt: string | null;
  checks: {
    dnsOk: boolean | null;
    tlsOk: boolean | null;
    backupFresh: boolean | null;
    lveOk: boolean | null;
    panelTlsOk: boolean | null;
    mailOk: boolean | null;
  };
  summary: string;
  checkDetails?: Partial<Record<ServiceHealthCheckKey, ServiceHealthCheckDetailDto>>;
}

@Injectable()
export class ServiceHealthService {
  private readonly logger = new Logger(ServiceHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
  ) {}

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
      include: { account: { include: { server: true } }, plan: { select: { productKind: true } } },
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

    let account = sub.account;
    const server = account.server;
    if (account.daPasswordEnc) {
      const synced = await this.directAdmin.syncPrimaryDomainForSubscription(
        subscriptionId,
        sub.userId,
      );
      if (synced) {
        account = { ...account, domain: synced };
      }
    }
    const checks = {
      dnsOk: null as boolean | null,
      tlsOk: null as boolean | null,
      backupFresh: null as boolean | null,
      lveOk: null as boolean | null,
      panelTlsOk: null as boolean | null,
      mailOk: null as boolean | null,
    };

    // MAIL-HEALTH — usługa poczty nie ma strony WWW: health liczymy z checków
    // mailowych (MX + serwer poczty), bez HTTPS strony i panelu DA.
    const isEmail = sub.plan?.productKind === 'EMAIL';

    let earned = 0;
    let possible = 0;

    // Konto aktywne (15)
    possible += 15;
    if (account.status === 'ACTIVE') earned += 15;

    const panelHost = server.hostname ?? server.daHost ?? server.ipAddress;
    const mailHost = server.hostname ?? server.ipAddress;

    // Deklaracje na poziomie funkcji — używane też w probeMeta poniżej.
    let dnsResolved: string[] = [];
    let siteTls: { ok: boolean; authorized?: boolean; error?: string } = { ok: false };
    let panelTls: { ok: boolean; authorized?: boolean; error?: string } = { ok: false };

    if (isEmail) {
      // DNS poczty: MX domeny wskazuje na serwer poczty węzła (25).
      possible += 25;
      try {
        const mx = await dns.resolveMx(account.domain);
        const target = mailHost.toLowerCase();
        checks.dnsOk = mx.some((r) => {
          const ex = r.exchange.toLowerCase().replace(/\.$/, '');
          return ex === target || ex.endsWith('.verris.pl');
        });
        if (checks.dnsOk) earned += 25;
      } catch {
        checks.dnsOk = false;
      }
      // TLS strony i panel DA nie dotyczą poczty — poza pulą (null).
    } else {
      // DNS domeny klienta → IP węzła (25)
      possible += 25;
      try {
        dnsResolved = await dns.resolve4(account.domain);
        checks.dnsOk = dnsResolved.includes(server.ipAddress);
        if (checks.dnsOk) earned += 25;
      } catch {
        checks.dnsOk = false;
      }

      // TLS :443 domeny klienta (15)
      possible += 15;
      siteTls = await this.probeTls(account.domain, 443);
      checks.tlsOk = siteTls.ok && siteTls.authorized === true;
      if (checks.tlsOk) earned += 15;
      else if (siteTls.ok) earned += 5;

      // Panel DA (hostname węzła :2222) — cert zaufany (15)
      possible += 15;
      panelTls = await this.probeTls(panelHost, server.daPort ?? 2222);
      checks.panelTlsOk = panelTls.ok && panelTls.authorized === true;
      if (checks.panelTlsOk) earned += 15;
      else if (panelTls.ok) earned += 5;
    }

    // Poczta węzła — IMAPS :993 (fallback :587). Brak nasłuchu = infra niegotowa, nie karzemy klienta.
    let mailTls = await this.probeTls(mailHost, 993);
    let mailPort = 993;
    if (!mailTls.ok && this.isMailPortClosed(mailTls.error)) {
      const smtpTls = await this.probeTls(mailHost, 587);
      if (smtpTls.ok) {
        mailTls = smtpTls;
        mailPort = 587;
      }
    }
    if (mailTls.ok) {
      possible += 10;
      checks.mailOk = true;
      earned += mailTls.authorized === true ? 10 : 7;
    } else if (this.isMailPortClosed(mailTls.error)) {
      checks.mailOk = null;
    } else {
      possible += 10;
      checks.mailOk = false;
    }

    // LVE / CPU z ostatniej metryki (20)
    possible += 20;
    let cpuUsageAvg: number | null = null;
    const cpuLimit = account.cpuLimit;
    const usage = await this.prisma.usageMetric.findFirst({
      where: { subscriptionId },
      orderBy: { bucketStart: 'desc' },
    });
    if (usage) {
      cpuUsageAvg = usage.cpuUsageAvg;
      const limit = Math.max(1, account.cpuLimit);
      checks.lveOk = usage.cpuUsageAvg < limit * 0.92;
      if (checks.lveOk) earned += 20;
      else if (usage.cpuUsageAvg < limit) earned += 10;
    }

    // Backup freshness (10) — realny sygnał: nasz lastBackupAt + lista backupów DA.
    const backup = await this.assessBackupFreshness(subscriptionId, account);
    if (backup.counted) {
      possible += 10;
      checks.backupFresh = backup.fresh;
      if (backup.fresh) earned += backup.partial ? 6 : 10;
    } else {
      // DA niedostępne i brak własnego sygnału — nie karzemy (null, poza pulą).
      checks.backupFresh = null;
    }

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

    const probeMeta: HealthProbeMeta = {
      domain: account.domain,
      serverIp: server.ipAddress,
      dnsResolved,
      siteTls,
      panelHost,
      panelTls,
      mailHost,
      mailTls,
      mailPort,
      cpuUsageAvg,
      cpuLimit,
      backupCounted: backup.counted,
    };
    const checkDetails = buildHealthCheckDetails(checks, probeMeta);

    const snapshot = await this.prisma.serviceHealthSnapshot.create({
      data: {
        subscriptionId,
        score: score ?? 0,
        dnsOk: checks.dnsOk,
        tlsOk: checks.tlsOk,
        backupFresh: checks.backupFresh,
        lveOk: checks.lveOk,
        panelTlsOk: checks.panelTlsOk,
        mailOk: checks.mailOk,
        details: JSON.parse(
          JSON.stringify({
            summary,
            earned,
            possible,
            panelHost,
            mailHost,
            probeMeta,
            checkDetails,
          }),
        ) as Prisma.InputJsonValue,
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
    panelTlsOk: boolean | null;
    mailOk: boolean | null;
    computedAt: Date;
    details: unknown;
  }): ComputedHealthSummary {
    const details =
      row.details && typeof row.details === 'object' && !Array.isArray(row.details)
        ? (row.details as {
            summary?: string;
            checkDetails?: Partial<Record<ServiceHealthCheckKey, ServiceHealthCheckDetailDto>>;
            probeMeta?: HealthProbeMeta;
          })
        : {};
    const score = row.score;
    const checks = {
      dnsOk: row.dnsOk,
      tlsOk: row.tlsOk,
      backupFresh: row.backupFresh,
      lveOk: row.lveOk,
      panelTlsOk: row.panelTlsOk,
      mailOk: row.mailOk,
    };
    let checkDetails = details.checkDetails;
    if (!checkDetails && details.probeMeta) {
      checkDetails = buildHealthCheckDetails(checks, details.probeMeta);
    }
    if (!checkDetails) {
      checkDetails = fallbackHealthCheckDetails(checks);
    }
    return {
      score,
      label: score >= 80 ? 'healthy' : score >= 50 ? 'attention' : 'critical',
      checkedAt: row.computedAt.toISOString(),
      checks,
      summary: details.summary ?? 'Ostatnia diagnostyka zapisana.',
      checkDetails,
    };
  }

  /**
   * Real backup-freshness signal combining:
   *  - `account.lastBackupAt` (set when we trigger a backup), and
   *  - the live DirectAdmin backup list (presence + best-effort filename date).
   * Returns `counted=false` only when DA is unreachable AND we have no own signal,
   * so a transient DA outage never tanks the score.
   */
  private async assessBackupFreshness(
    subscriptionId: string,
    account: { userId: string; lastBackupAt: Date | null },
  ): Promise<{ counted: boolean; fresh: boolean; partial: boolean }> {
    const lastManual = account.lastBackupAt?.getTime() ?? null;

    let listError = false;
    let listCount = 0;
    let newestFromList: number | null = null;
    try {
      const { rows, fetchError } = await this.directAdmin.listHostingBackups(
        subscriptionId,
        account.userId,
      );
      if (fetchError) {
        listError = true;
      } else {
        listCount = rows.length;
        const dates = rows
          .map((r) => parseBackupDate(r.fileName))
          .filter((d): d is number => d != null);
        newestFromList = dates.length ? Math.max(...dates) : null;
      }
    } catch {
      listError = true;
    }

    const newest = Math.max(lastManual ?? 0, newestFromList ?? 0) || null;
    if (newest) {
      return { counted: true, fresh: Date.now() - newest <= BACKUP_FRESH_WINDOW_MS, partial: false };
    }
    if (listError && lastManual == null) {
      return { counted: false, fresh: false, partial: false };
    }
    if (listCount > 0) {
      // Backups exist but age is unknown — partial credit, treat as present.
      return { counted: true, fresh: true, partial: true };
    }
    // No backups found at all.
    return { counted: true, fresh: false, partial: false };
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
        panelTlsOk: null,
        mailOk: null,
      },
      summary: text,
      checkDetails: {},
    };
  }

  /** Port closed on node — hosting mail stack (Exim/Dovecot) not listening yet. */
  private isMailPortClosed(error?: string): boolean {
    if (!error) return false;
    const e = error.toLowerCase();
    return e.includes('econnrefused') || e.includes('connect econnrefused');
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
    if (checks.panelTlsOk === false) parts.push('panel hostingu wymaga uwagi');
    if (checks.mailOk === false) parts.push('serwer poczty nie odpowiada');
    if (checks.lveOk === false) parts.push('wysokie obciążenie CPU');
    if (checks.backupFresh === false) parts.push('brak świeżej kopii zapasowej (>8 dni)');
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

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Best-effort extraction of a date from a DirectAdmin backup filename.
 * Handles common shapes: `...2024-04-15...`, `...Apr-15-2024...`,
 * `...20240415...` and 10-digit unix epochs. Returns epoch ms or null.
 */
function parseBackupDate(fileName: string): number | null {
  if (!fileName) return null;
  const lower = fileName.toLowerCase();

  const iso = lower.match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if (iso) {
    const t = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(t)) return t;
  }

  const named = lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-_.]?(\d{1,2})[-_.]?(20\d{2})/);
  if (named && MONTHS[named[1]] != null) {
    const t = Date.UTC(Number(named[3]), MONTHS[named[1]], Number(named[2]));
    if (!Number.isNaN(t)) return t;
  }

  const epoch = lower.match(/\b(1\d{9})\b/);
  if (epoch) {
    const t = Number(epoch[1]) * 1000;
    if (t > Date.UTC(2015, 0, 1) && t < Date.now() + 86_400_000) return t;
  }

  return null;
}
