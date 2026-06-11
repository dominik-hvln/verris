import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus, WafMode } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

/**
 * B2 — ModSecurity WAF (OWASP CRS) per account.
 *
 * The node profile installs ModSecurity + OWASP CRS server-wide (CustomBuild).
 * The per-account MODE (OFF / DETECTION / ON) is applied by the on-node agent
 * via a WAF_APPLY task that maintains a managed block in the domain's
 * .htaccess (SecRuleEngine). Default for new accounts: DETECTION (log only) —
 * the customer or admin can switch to ON (blocking) per account.
 */
@Injectable()
export class WafService {
  private readonly logger = new Logger(WafService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Customer view: current + last applied state for their service. */
  async statusForSubscription(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    return this.describeAccount(sub.account!.id);
  }

  /** Customer: change WAF mode for own service. */
  async setModeForSubscription(
    subscriptionId: string,
    userId: string,
    mode: WafMode,
  ) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    return this.queueApply(sub.account!.id, mode, userId, 'customer');
  }

  /** Admin: change WAF mode for any account. */
  async setModeForAccount(accountId: string, mode: WafMode, actorUserId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    return this.queueApply(accountId, mode, actorUserId, 'admin');
  }

  /** Admin: WAF overview for all accounts on a node. */
  async overviewForServer(serverId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { serverId },
      select: {
        id: true,
        domain: true,
        daUsername: true,
        status: true,
        wafMode: true,
        wafAppliedAt: true,
      },
      orderBy: { domain: 'asc' },
    });
    return { serverId, accounts };
  }

  // ---------------------------------------------------------------------------

  private async queueApply(
    accountId: string,
    mode: WafMode,
    actorUserId: string,
    source: 'customer' | 'admin',
  ) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    }

    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        accountId,
        kind: NodeTaskKind.WAF_APPLY,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) {
      throw new ConflictException('Zmiana ustawień WAF jest już w toku.');
    }

    const [task] = await this.prisma.$transaction([
      this.prisma.nodeTask.create({
        data: {
          serverId: account.serverId,
          accountId,
          kind: NodeTaskKind.WAF_APPLY,
          status: NodeTaskStatus.QUEUED,
          requestedById: actorUserId,
          payload: {
            daUser: account.daUsername,
            domain: account.domain,
            mode,
          },
        },
      }),
      this.prisma.account.update({
        where: { id: accountId },
        data: { wafMode: mode },
      }),
    ]);

    await this.audit.record({
      action: 'WAF_MODE_CHANGE_QUEUED',
      userId: account.userId,
      actorUserId,
      details: { accountId, domain: account.domain, mode, source, taskId: task.id },
    });

    this.logger.log(
      `WAF ${account.domain} → ${mode} (task=${task.id}, source=${source})`,
    );
    return this.describeAccount(accountId);
  }

  private async describeAccount(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, domain: true, wafMode: true, wafAppliedAt: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    const lastTask = await this.prisma.nodeTask.findFirst({
      where: { accountId, kind: NodeTaskKind.WAF_APPLY },
      orderBy: { createdAt: 'desc' },
    });
    return {
      accountId: account.id,
      domain: account.domain,
      mode: account.wafMode,
      appliedAt: account.wafAppliedAt?.toISOString() ?? null,
      lastTask: lastTask
        ? {
            id: lastTask.id,
            status: lastTask.status,
            errorMessage: lastTask.errorMessage,
            createdAt: lastTask.createdAt.toISOString(),
            completedAt: lastTask.completedAt?.toISOString() ?? null,
          }
        : null,
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
