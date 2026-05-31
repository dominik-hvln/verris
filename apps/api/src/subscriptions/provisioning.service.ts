import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AccountStatus,
  Plan,
  Prisma,
  Server,
  Subscription,
  SubscriptionStatus,
  User,
} from '@verris/database';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { ServersService } from '../servers/servers.service';
import { NodeSelectorService } from './node-selector.service';
import { MailerService } from '../mail/mailer.service';
import { accountProvisionedTemplate } from '../mail/templates/hosting-notifications';
import {
  DA_DEFAULT_LANGUAGE,
  buildDaPackageSpecFromPlan,
  planResourceFields,
} from '../servers/da-package-spec';

export interface ProvisionResult {
  subscription: Subscription;
  accountId: string;
  daUsername: string;
  daPassword: string;
  serverId: string;
  domain: string;
}

const DA_USERNAME_MAX = 8;

/** DirectAdmin `ip=` for CMD_API_ACCOUNT_USER — single-IP nodes need the public IP, not `shared`. */
function resolveDaAccountIp(server: Pick<Server, 'ipAddress'>): string {
  const ip = server.ipAddress?.trim();
  if (ip && ip !== '0.0.0.0' && !ip.startsWith('pending-')) {
    return ip;
  }
  return 'shared';
}

/**
 * End-to-end provisioning flow for a paid subscription.
 *
 * Today this runs *synchronously* inside the same request — that's good enough
 * for the first launch (a single account create on DA takes ~2-5 s). Once we
 * have BullMQ wired in (EPIC B continuation) we'll move the DA call into a
 * worker and keep this service as the orchestration layer.
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly nodeSelector: NodeSelectorService,
    private readonly da: DirectAdminService,
    private readonly servers: ServersService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Provisions an account on a node for a subscription that's already paid for.
   * Returns the credentials so the panel can show them to the customer.
   */
  async provisionForSubscription(
    subscriptionId: string,
    options: { domain: string; preferredRegion?: string | null },
    actorUserId?: string,
  ): Promise<ProvisionResult> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, user: true, account: true },
    });

    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.account) {
      throw new ConflictException('Subscription already has a provisioned account');
    }
    if (
      subscription.status !== SubscriptionStatus.PROVISIONING &&
      subscription.status !== SubscriptionStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        `Cannot provision subscription in status=${subscription.status}`,
      );
    }

    const domain = normaliseDomain(options.domain);

    const existingDomainAccount = await this.prisma.account.findUnique({ where: { domain } });
    if (existingDomainAccount) {
      throw new ConflictException(`Domain "${domain}" is already taken on the platform`);
    }

    const server = await this.nodeSelector.pickServerForPlan(subscription.plan, {
      preferredRegion: options.preferredRegion,
    });
    const daUsername = await this.allocateUniqueDaUsername(subscription.user, subscription.id);

    const daClient = await this.da.getClientForServer(server.id);

    try {
      await daClient.ensureUserPackage(
        buildDaPackageSpecFromPlan(planResourceFields(subscription.plan)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `DA ensureUserPackage failed for sub=${subscription.id} pkg=${subscription.plan.slug}: ${msg}`,
      );
      await this.audit.record({
        action: 'PROVISIONING_FAILED',
        userId: subscription.userId,
        actorUserId: actorUserId ?? null,
        details: {
          subscriptionId,
          serverId: server.id,
          stage: 'ensureUserPackage',
          package: subscription.plan.slug,
          error: msg,
        },
      });
      throw new ServiceUnavailableException(
        `DirectAdmin package "${subscription.plan.slug}" is missing on the node and could not be created automatically. Contact support.`,
      );
    }

    const ns = await this.servers.resolveNameservers(server);
    let daResult;
    try {
      daResult = await daClient.createAccount({
        username: daUsername,
        email: subscription.user.email,
        domain,
        packageName: subscription.plan.slug,
        notify: 'no',
        ip: resolveDaAccountIp(server),
        language: DA_DEFAULT_LANGUAGE,
        ns1: ns.ns1 || undefined,
        ns2: ns.ns2 || undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`DA createAccount failed for sub=${subscription.id}: ${msg}`);
      await this.audit.record({
        action: 'PROVISIONING_FAILED',
        userId: subscription.userId,
        actorUserId: actorUserId ?? null,
        details: {
          subscriptionId,
          serverId: server.id,
          stage: 'createAccount',
          error: msg,
        },
      });
      throw new ServiceUnavailableException(
        'Failed to create the hosting account on the selected node. Our team has been notified.',
      );
    }

    // Apply LVE limits matching the plan's base configuration. If this fails we
    // *don't* bring the whole flow down — the account is created, status will
    // be ACTIVE but with the default DA package limits and we surface a warning.
    let limitsApplied = true;
    try {
      await daClient.setAccountLimits(daUsername, {
        cpuPercent: subscription.plan.cpuLimit,
        memoryMb: subscription.plan.ramLimitMb,
        diskQuotaMb: subscription.plan.diskLimitMb,
        ioKbps: subscription.plan.ioLimitKbps,
        iops: subscription.plan.iopsLimit,
        entryProcesses: subscription.plan.entryProcesses,
        nproc: subscription.plan.nprocLimit,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `DA setAccountLimits failed for sub=${subscription.id} user=${daUsername}: ${msg}`,
      );
      throw new ServiceUnavailableException(
        'CloudLinux LVE limits could not be applied on this node. Provisioning aborted.',
      );
    }

    const passwordEnc = this.crypto.encrypt(daResult.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          daUsername,
          daPasswordEnc: passwordEnc,
          domain,
          status: AccountStatus.ACTIVE,
          cpuLimit: subscription.plan.cpuLimit,
          ramLimitMb: subscription.plan.ramLimitMb,
          diskLimitMb: subscription.plan.diskLimitMb,
          ioLimitKbps: subscription.plan.ioLimitKbps,
          iopsLimit: subscription.plan.iopsLimit,
          entryProcesses: subscription.plan.entryProcesses,
          nprocLimit: subscription.plan.nprocLimit,
          userId: subscription.userId,
          serverId: server.id,
          subscriptionId: subscription.id,
        },
      });

      const updatedSub = await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.ACTIVE },
      });

      await tx.server.update({
        where: { id: server.id },
        data: {
          allocatedCpu: { increment: subscription.plan.cpuLimit },
          allocatedMemory: { increment: subscription.plan.ramLimitMb },
          allocatedDisk: { increment: subscription.plan.diskLimitMb },
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: 'ACCOUNT_PROVISIONED',
          details: {
            accountId: account.id,
            serverId: server.id,
            daUsername,
            limitsApplied,
          },
        },
      });

      return { account, updatedSub };
    });

    await this.audit.record({
      action: 'SUBSCRIPTION_ACTIVATED',
      userId: subscription.userId,
      actorUserId: actorUserId ?? null,
      details: {
        subscriptionId: subscription.id,
        accountId: result.account.id,
        serverId: server.id,
        daUsername,
        limitsApplied,
      },
    });

    if (subscription.ecoModeEnabled) {
      try {
        const ecoSync = await this.da.applyEcoModeBackupCronPolicy(
          subscription.id,
          subscription.userId,
          true,
        );
        if (ecoSync.adjusted > 0) {
          this.logger.log(
            `Provisioning EKO sync sub=${subscription.id}: adjusted=${ecoSync.adjusted}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Provisioning EKO DA sync failed sub=${subscription.id}: ${msg}`);
      }
    }

    void this.notifyAccountProvisioned({
      userId: subscription.userId,
      domain,
      daUsername,
      daPassword: daResult.password,
      planName: subscription.plan.name,
    }).catch((err) => {
      this.logger.warn(
        `notifyAccountProvisioned failed for sub=${subscription.id}: ${(err as Error).message}`,
      );
    });

    return {
      subscription: result.updatedSub,
      accountId: result.account.id,
      daUsername,
      daPassword: daResult.password,
      serverId: server.id,
      domain,
    };
  }

  private async notifyAccountProvisioned(opts: {
    userId: string;
    domain: string;
    daUsername: string;
    daPassword: string;
    planName: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, firstName: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) return;

    const panelUrl =
      this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';

    const message = accountProvisionedTemplate({
      to: user.email,
      firstName: user.firstName,
      planName: opts.planName,
      domain: opts.domain,
      daUsername: opts.daUsername,
      daPassword: opts.daPassword,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'NOREPLY' });
  }

  /**
   * Generates a deterministic-but-collision-resistant DA username from the
   * customer's email + a random suffix, retrying on uniqueness conflicts.
   */
  private async allocateUniqueDaUsername(user: User, subscriptionId: string): Promise<string> {
    const localPart = user.email.split('@')[0] ?? 'user';
    const sanitised = localPart.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 4) || 'user';
    const subSuffix = subscriptionId.replace(/-/g, '').slice(0, 4);

    for (let attempt = 0; attempt < 5; attempt++) {
      const random = randomAlphanumeric(DA_USERNAME_MAX - sanitised.length - subSuffix.length);
      const candidate = `${sanitised}${subSuffix}${random}`.slice(0, DA_USERNAME_MAX).toLowerCase();
      const exists = await this.prisma.account.findUnique({ where: { daUsername: candidate } });
      if (!exists) return candidate;
    }
    throw new ServiceUnavailableException('Could not allocate a unique DA username');
  }
}

function normaliseDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed)) {
    throw new BadRequestException('Invalid domain format');
  }
  return trimmed;
}

function randomAlphanumeric(length: number): string {
  const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return out;
}

