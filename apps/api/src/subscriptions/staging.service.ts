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

const STAGING_SUB = 'staging';

/**
 * B5 — staging 1-click.
 *
 * UX contract: ONE staging per service, always `staging.<primary domain>`,
 * zero configuration. Three actions:
 *   - create/refresh → DA subdomain + DB (first time), then a STAGING_SYNC
 *     node task clones files (rsync) and, for WordPress, the database with
 *     URL search-replace;
 *   - push → STAGING_SYNC(TO_LIVE): backup of live files first, then
 *     staging → live (files + WP db with reverse search-replace);
 *   - delete → removes the subdomain incl. contents (DB stays, visible in
 *     the panel's database tab — communicated in the UI).
 */
@Injectable()
export class StagingService {
  private readonly logger = new Logger(StagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly da: DirectAdminService,
  ) {}

  async statusForSubscription(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const account = sub.account!;
    const lastTask = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.STAGING_SYNC },
      orderBy: { createdAt: 'desc' },
    });
    const payload = (lastTask?.payload ?? {}) as { direction?: string };
    return {
      domain: account.domain,
      stagingDomain: `${STAGING_SUB}.${account.domain}`,
      stagingUrl: `https://${STAGING_SUB}.${account.domain}`,
      exists: Boolean(account.stagingCreatedAt),
      createdAt: account.stagingCreatedAt?.toISOString() ?? null,
      syncedAt: account.stagingSyncedAt?.toISOString() ?? null,
      lastTask: lastTask
        ? {
            id: lastTask.id,
            direction: payload.direction ?? null,
            status: lastTask.status,
            errorMessage: lastTask.errorMessage,
            createdAt: lastTask.createdAt.toISOString(),
            completedAt: lastTask.completedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /** Create staging (first time) or refresh it from production. */
  async createOrRefresh(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const account = sub.account!;
    await this.assertNoInflight(account.id);

    const firstTime = !account.stagingCreatedAt;
    let dbName: string | null = null;
    let dbUser: string | null = null;
    let dbPass: string | null = null;

    if (firstTime) {
      // 1) DA subdomain (idempotent on DA side — "already exists" tolerated).
      try {
        await this.da.createHostingStaging(subscriptionId, userId, {
          domain: account.domain,
          label: STAGING_SUB,
          withDatabase: false,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/exist/i.test(msg)) {
          throw new BadRequestException(`Nie udało się utworzyć subdomeny staging: ${msg}`);
        }
      }
      // 2) Dedicated staging DB (used only if the site is WordPress).
      const short = `stg${randomBytes(2).toString('hex')}`;
      dbPass = randomBytes(18).toString('base64url');
      try {
        const client = await this.da.getClientForHostingAccount(account.id, userId);
        const created = await client.createMysqlDatabase({
          name: short,
          user: short,
          password: dbPass,
        });
        dbName = created.database;
        dbUser = created.username;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Staging DB create failed sub=${subscriptionId}: ${msg}`);
        // Files-only staging still works (non-WP sites) — continue without DB.
        dbName = null;
        dbUser = null;
        dbPass = null;
      }
    }

    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.STAGING_SYNC,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: {
          direction: 'TO_STAGING',
          daUser: account.daUsername,
          domain: account.domain,
          sub: STAGING_SUB,
          ...(dbName ? { dbName, dbUser, dbPass } : {}),
        },
      },
    });

    await this.audit.record({
      action: firstTime ? 'STAGING_CREATE_QUEUED' : 'STAGING_REFRESH_QUEUED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, domain: account.domain, taskId: task.id },
    });

    return this.statusForSubscription(subscriptionId, userId);
  }

  /** Publish staging → production (live files are backed up first on the node). */
  async pushToLive(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const account = sub.account!;
    if (!account.stagingCreatedAt) {
      throw new BadRequestException('Najpierw utwórz kopię roboczą (staging).');
    }
    await this.assertNoInflight(account.id);

    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.STAGING_SYNC,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: {
          direction: 'TO_LIVE',
          daUser: account.daUsername,
          domain: account.domain,
          sub: STAGING_SUB,
        },
      },
    });

    await this.audit.record({
      action: 'STAGING_PUSH_QUEUED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, domain: account.domain, taskId: task.id },
    });

    return this.statusForSubscription(subscriptionId, userId);
  }

  async remove(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const account = sub.account!;
    await this.assertNoInflight(account.id);

    await this.da.deleteHostingStaging(subscriptionId, userId, {
      domain: account.domain,
      subdomain: STAGING_SUB,
    });
    await this.prisma.account.update({
      where: { id: account.id },
      data: { stagingCreatedAt: null, stagingSyncedAt: null },
    });

    await this.audit.record({
      action: 'STAGING_DELETED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, domain: account.domain },
    });

    return this.statusForSubscription(subscriptionId, userId);
  }

  // ---------------------------------------------------------------------------

  private async assertNoInflight(accountId: string) {
    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        accountId,
        kind: NodeTaskKind.STAGING_SYNC,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) {
      throw new ConflictException('Operacja na stagingu jest już w toku — poczekaj na jej zakończenie.');
    }
  }

  private async requireOwnedSub(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) {
      throw new BadRequestException('Staging będzie dostępny po aktywacji konta hostingowego.');
    }
    return sub;
  }
}
