import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { promises as dns } from 'dns';
import { Role, ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { AuditService } from '../common/audit/audit.service';
import { nodeRblAlertTemplate, nodeRblClearedTemplate } from '../mail/templates/ops-notifications';

// Widely-used DNS blocklists (parytet z DeliverabilityService).
const RBL_ZONES = ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org', 'dnsbl.sorbs.net'];
const ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000; // re-alert max co 12h/węzeł
const DNS_TIMEOUT_MS = 3500;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

/**
 * CMP-5b — proaktywny monitoring reputacji IP floty.
 *
 * Co 6h skanuje IP wszystkich ACTIVE węzłów po publicznych blacklistach (RBL).
 * Gdy IP węzła trafi na listę → alert do wszystkich adminów (cooldown 12h via
 * audit). Gdy IP zniknie z list po wcześniejszym alercie → powiadomienie o
 * przywróceniu reputacji. Bez zmian w schemacie — de-dup oparty o AuditLog
 * (NODE_RBL_ALERT / NODE_RBL_CLEARED z serverId w details).
 *
 * Dlaczego to ważne dla Verris: nowe IP nie mają historii. Wczesne wykrycie
 * wpisu na RBL pozwala szybko zareagować (delisting, blokada spamującego konta)
 * zanim ucierpi dostarczalność poczty wszystkich klientów na węźle.
 */
@Injectable()
export class RblReputationScheduler {
  private readonly logger = new Logger(RblReputationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
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

  /** Zwraca listę stref RBL, na których IP jest wpisane (puste = czyste). */
  private async listedZones(ip: string): Promise<string[]> {
    const reversed = ip.split('.').reverse().join('.');
    const results = await Promise.all(
      RBL_ZONES.map(async (zone) => {
        try {
          const res: string[] = await withTimeout(dns.resolve4(`${reversed}.${zone}`), DNS_TIMEOUT_MS);
          return res.length > 0 ? zone : null;
        } catch {
          return null; // NXDOMAIN / timeout = traktujemy jako brak wpisu
        }
      }),
    );
    return results.filter((z): z is string => z !== null);
  }

  @Cron('0 */6 * * *')
  async scanFleet(): Promise<void> {
    try {
      const servers = await this.prisma.server.findMany({
        where: { status: ServerStatus.ACTIVE },
        select: { id: true, name: true, hostname: true, ipAddress: true },
      });
      const targets = servers.filter((s) => s.ipAddress && /^\d+\.\d+\.\d+\.\d+$/.test(s.ipAddress));
      if (targets.length === 0) return;

      const admins = await this.admins();
      const now = Date.now();
      const since = new Date(now - 25 * 60 * 60 * 1000);
      const recent = await this.prisma.auditLog.findMany({
        where: { action: { in: ['NODE_RBL_ALERT', 'NODE_RBL_CLEARED'] }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        select: { action: true, details: true, createdAt: true },
      });
      const lastFor = (serverId: string, action: string) =>
        recent.find(
          (r) => r.action === action && (r.details as { serverId?: string } | null)?.serverId === serverId,
        )?.createdAt ?? null;

      for (const s of targets) {
        const ip = s.ipAddress as string;
        const name = s.name ?? s.hostname ?? s.id;
        const zones = await this.listedZones(ip);
        const lastAlert = lastFor(s.id, 'NODE_RBL_ALERT');
        const lastCleared = lastFor(s.id, 'NODE_RBL_CLEARED');

        if (zones.length > 0) {
          const onCooldown = lastAlert && now - lastAlert.getTime() < ALERT_COOLDOWN_MS;
          if (onCooldown) continue;
          await this.audit.record({ action: 'NODE_RBL_ALERT', details: { serverId: s.id, name, ip, zones } });
          if (admins.length > 0) {
            await this.fanOut(admins, (a) =>
              nodeRblAlertTemplate({ to: a.email, firstName: a.firstName, nodeName: name, nodeId: s.id, ip, zones, panelUrl: this.panelUrl() }),
            );
          }
          this.logger.warn(`RBL alert: ${name} (${ip}) listed on ${zones.join(', ')}`);
        } else if (lastAlert && (!lastCleared || lastCleared < lastAlert)) {
          // Był alert, IP już czyste i jeszcze nie potwierdzone → przywrócenie.
          await this.audit.record({ action: 'NODE_RBL_CLEARED', details: { serverId: s.id, name, ip } });
          if (admins.length > 0) {
            await this.fanOut(admins, (a) =>
              nodeRblClearedTemplate({ to: a.email, firstName: a.firstName, nodeName: name, nodeId: s.id, ip, zones: [], panelUrl: this.panelUrl() }),
            );
          }
          this.logger.log(`RBL cleared: ${name} (${ip})`);
        }
      }
    } catch (err) {
      this.logger.error(`scanFleet failed: ${(err as Error).message}`);
    }
  }

  private async fanOut(
    admins: Array<{ id: string; email: string; firstName: string | null }>,
    build: (a: { id: string; email: string; firstName: string | null }) => ReturnType<typeof nodeRblAlertTemplate>,
  ): Promise<void> {
    await Promise.all(
      admins.map((a) =>
        this.mailer
          .send({ ...build(a), userId: a.id, category: 'TRANSACTIONAL', fromRole: 'SECURITY' })
          .catch((err) => this.logger.warn(`RBL mail to ${a.email} failed: ${(err as Error).message}`)),
      ),
    );
  }
}
