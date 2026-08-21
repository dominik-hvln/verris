import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DirectAdminService } from '../servers/directadmin.service';

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
    return {
      domain: sub.account!.domain,
      task: task
        ? {
            id: task.id,
            status: task.status,
            errorMessage: task.errorMessage,
            createdAt: task.createdAt.toISOString(),
            completedAt: task.completedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async install(
    subscriptionId: string,
    userId: string,
    input: { siteTitle: string; adminUser: string; adminEmail: string; locale?: string },
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

    const siteTitle = input.siteTitle?.trim() || account.domain;
    const adminUser = (input.adminUser || '').trim();
    const adminEmail = (input.adminEmail || '').trim();
    if (!/^[a-zA-Z0-9_.@-]{3,60}$/.test(adminUser)) {
      throw new BadRequestException('Nieprawidłowy login administratora WordPress.');
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
      throw new BadRequestException('Nieprawidłowy e-mail administratora.');
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
          domain: account.domain,
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
      details: { subscriptionId, accountId: account.id, domain: account.domain, taskId: task.id },
    });

    // Return admin credentials ONCE — they are not retrievable later.
    return {
      ok: true as const,
      taskId: task.id,
      domain: account.domain,
      adminUrl: `https://${account.domain}/wp-admin`,
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
