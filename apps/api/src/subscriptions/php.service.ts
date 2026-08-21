import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

/**
 * P-6 — per-account PHP version selection (CloudLinux PHP Selector).
 *
 * The available versions are a platform setting; the change is applied on the
 * node by the agent via a PHP_APPLY task (selectorctl). Mirrors the WAF_APPLY
 * pattern: queue one task at a time, reflect last-applied + task status.
 */
@Injectable()
export class PhpService {
  private readonly logger = new Logger(PhpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async statusForSubscription(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    return this.describe(sub.account!.id);
  }

  async setVersionForSubscription(subscriptionId: string, userId: string, version: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    return this.queueApply(sub.account!.id, version, userId);
  }

  private async queueApply(accountId: string, version: string, actorUserId: string) {
    const available = await this.settings.getAvailablePhpVersions();
    if (!available.includes(version)) {
      throw new BadRequestException(`Nieobsługiwana wersja PHP. Dostępne: ${available.join(', ')}.`);
    }
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    }
    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        accountId,
        kind: NodeTaskKind.PHP_APPLY,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) throw new ConflictException('Zmiana wersji PHP jest już w toku.');

    const [task] = await this.prisma.$transaction([
      this.prisma.nodeTask.create({
        data: {
          serverId: account.serverId,
          accountId,
          kind: NodeTaskKind.PHP_APPLY,
          status: NodeTaskStatus.QUEUED,
          requestedById: actorUserId,
          payload: { daUser: account.daUsername, domain: account.domain, version },
        },
      }),
      this.prisma.account.update({ where: { id: accountId }, data: { phpVersion: version } }),
    ]);

    await this.audit.record({
      action: 'PHP_VERSION_CHANGE_QUEUED',
      userId: account.userId,
      actorUserId,
      details: { accountId, domain: account.domain, version, taskId: task.id },
    });
    this.logger.log(`PHP ${account.domain} → ${version} (task=${task.id})`);
    return this.describe(accountId);
  }

  private async describe(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, domain: true, phpVersion: true, phpAppliedAt: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    const [available, lastTask] = await Promise.all([
      this.settings.getAvailablePhpVersions(),
      this.prisma.nodeTask.findFirst({
        where: { accountId, kind: NodeTaskKind.PHP_APPLY },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      accountId: account.id,
      domain: account.domain,
      version: account.phpVersion,
      availableVersions: available,
      appliedAt: account.phpAppliedAt?.toISOString() ?? null,
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
