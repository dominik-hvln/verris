import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { bladZadaniaDlaKlienta } from './blad-zadania.js';

/**
 * A4 — 1-click WordPress installer.
 *
 * Flow: create a DA-tracked MySQL database + user (control plane has the DA
 * session) → queue a per-account WP_INSTALL NodeTask whose payload carries the
 * db credentials + WP admin params → the on-node agent runs wp-cli as the
 * account user. The generated WP admin password is returned to the customer
 * ONCE (never stored in plaintext).
 */
@Injectable()
export class WordpressService {
  private readonly logger = new Logger(WordpressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly da: DirectAdminService,
  ) {}

  /** Latest WP_INSTALL task for the customer's service (status polling). */
  async statusForSubscription(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const task = await this.prisma.nodeTask.findFirst({
      where: { accountId: sub.account!.id, kind: NodeTaskKind.WP_INSTALL },
      orderBy: { createdAt: 'desc' },
    });
    const lista = await this.da.witrynyKonta(subscriptionId, userId).catch(() => null);
    return {
      domain: sub.account!.domain,
      domains: lista?.witryny.length ? lista.witryny.map((w) => w.nazwa) : [sub.account!.domain],
      task: task
        ? {
            id: task.id,
            domain: String((task.payload as { domain?: unknown } | null)?.domain ?? sub.account!.domain),
            status: task.status,
            errorMessage: bladZadaniaDlaKlienta(task.errorMessage, task.outputLog),
            createdAt: task.createdAt.toISOString(),
            completedAt: task.completedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async install(
    subscriptionId: string,
    userId: string,
    input: { siteTitle: string; adminUser: string; adminEmail: string; locale?: string; domain?: string },
  ) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const account = sub.account!;

    // One in-flight install per account.
    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        accountId: account.id,
        kind: NodeTaskKind.WP_INSTALL,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) {
      throw new ConflictException('Instalacja WordPress jest już w toku dla tej usługi.');
    }

    // Test D3 29.09: WordPress szedł zawsze na domenę główną — przy drugiej domenie usługi nie dało się go
    // postawić z panelu. Domena spoza usługi odpada PRZED założeniem bazy (jak w instalatorze aplikacji).
    // Próba bety 06.10: także poddomena (beta.d3.hvln.pl, u klienta np. sklep.firma.pl).
    const domena = input.domain?.trim() ? (await this.da.witrynaKonta(subscriptionId, userId, input.domain)).nazwa : account.domain;
    const siteTitle = input.siteTitle?.trim() || domena;
    const adminUser = (input.adminUser || '').trim();
    const adminEmail = (input.adminEmail || '').trim();
    if (!/^[a-zA-Z0-9_.@-]{3,60}$/.test(adminUser)) {
      throw new BadRequestException('Nieprawidłowy login administratora WordPress.');
    }
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(adminEmail) || adminEmail.length > 120) {
      throw new BadRequestException('Nieprawidłowy e-mail administratora.');
    }
    if (siteTitle.length > 120 || /[\x00-\x1f\x7f]/.test(siteTitle)) {
      throw new BadRequestException('Tytuł strony: do 120 znaków, bez znaków sterujących.');
    }

    // Create the DA-tracked database + user.
    const dbShort = `wp${randomToken(4)}`;
    const dbPass = strongPassword();
    let db: { database: string; username: string };
    try {
      const client = await this.da.getClientForHostingAccount(account.id, userId);
      db = await client.createMysqlDatabase({ name: dbShort, user: dbShort, password: dbPass });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`WP install: DB create failed sub=${subscriptionId}: ${msg}`);
      throw new BadRequestException(`Nie udało się utworzyć bazy danych: ${msg}`);
    }

    const adminPass = strongPassword();
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.WP_INSTALL,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: {
          daUser: account.daUsername,
          domain: domena,
          dbName: db.database,
          dbUser: db.username,
          dbPass,
          siteTitle,
          adminUser,
          adminPass,
          adminEmail,
          locale: input.locale || 'pl_PL',
        },
      },
    });

    await this.audit.record({
      action: 'WORDPRESS_INSTALL_QUEUED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, domain: domena, taskId: task.id },
    });

    // Return admin credentials ONCE — they are not retrievable later.
    return {
      ok: true as const,
      taskId: task.id,
      domain: domena,
      adminUrl: `https://${domena}/wp-admin`,
      adminUser,
      adminPassword: adminPass,
      note: 'Zapisz hasło administratora — nie pokażemy go ponownie. Instalacja potrwa ~1 minutę.',
    };
  }

  private async requireOwnedSub(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return sub;
  }
}

function randomToken(len: number): string {
  return randomBytes(len).toString('hex').slice(0, len);
}

function strongPassword(): string {
  // 24 base64url chars — high entropy, safe for shells/wp-cli (no quotes).
  return randomBytes(18).toString('base64url');
}
