import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Account,
  AutoscalingDirection,
  AutoscalingPriceRule,
  AutoscalingResource,
  Plan,
  Prisma,
  Subscription,
  SubscriptionStatus,
  UsageMetric,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { MailerService } from '../mail/mailer.service';
import {
  AutoscalingEndReason,
  AutoscalingResourceDelta,
  autoscalingEndedTemplate,
  autoscalingStartedTemplate,
} from '../mail/templates/autoscaling-notifications';
import {
  hourlyCostForCatalogAmounts,
  scaledDiskMbToCatalogGb,
  scaledRamMbToCatalogGb,
} from './autoscaling-pricing.util';
import {
  AutoscalingBillingService,
  BILLING_BLOCK_MINUTES,
} from './autoscaling-billing.service';

/**
 * Autoscaling engine — scales CPU, RAM and disk when sustained pressure
 * is observed in bucketed telemetry (CloudLinux LVE + disk usage).
 */
@Injectable()
export class AutoscalingEngineService {
  private readonly logger = new Logger(AutoscalingEngineService.name);

  private readonly BUCKET_WINDOW_MIN = 5;
  private readonly UP_PRESSURE_RATIO = 0.8;
  private readonly DOWN_RELAX_RATIO = 0.3;
  private readonly UP_HITS_REQUIRED = 3;
  private readonly DOWN_HITS_REQUIRED = 5;
  private readonly SCALE_STEP_RATIO = 0.25;
  private readonly DEFAULT_MAX_OVERSCALE_RATIO = 3;
  private readonly UP_CPU_PRESSURE_FLOOR = 5;
  private readonly UP_RAM_PRESSURE_FLOOR_MB = 64;
  private readonly UP_DISK_PRESSURE_FLOOR_MB = 256;
  private readonly MIN_WALLET_BALANCE = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly da: DirectAdminService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly billing: AutoscalingBillingService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'autoscaling-engine' })
  async tick() {
    const started = Date.now();
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        autoscalingEnabled: true,
        account: { isNot: null },
      },
      include: {
        account: true,
        plan: true,
        user: { select: { walletBalance: true, email: true, firstName: true } },
      },
    });

    if (subs.length === 0) return;

    this.logger.debug(`Autoscaling engine tick — evaluating ${subs.length} subscription(s)`);

    const rules = await this.prisma.autoscalingPriceRule.findMany({
      where: { isActive: true },
    });

    let upCount = 0;
    let downCount = 0;
    let disabledCount = 0;

    for (const sub of subs) {
      try {
        const decision = await this.evaluate(sub, rules);
        if (decision === 'UP') upCount += 1;
        else if (decision === 'DOWN') downCount += 1;
        else if (decision === 'DISABLED') disabledCount += 1;
      } catch (err) {
        this.logger.error(
          `Autoscaling tick failed for sub=${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Autoscaling tick done in ${Date.now() - started}ms ` +
        `(up=${upCount} down=${downCount} disabled=${disabledCount} hold=${subs.length - upCount - downCount - disabledCount})`,
    );
  }

  private async evaluate(
    sub: Subscription & {
      account: Account | null;
      plan: Plan;
      user: { walletBalance: Prisma.Decimal; email: string; firstName: string | null };
    },
    rules: AutoscalingPriceRule[],
  ): Promise<'UP' | 'DOWN' | 'HOLD' | 'DISABLED'> {
    if (!sub.account) return 'HOLD';
    if (sub.account.status !== 'ACTIVE') return 'HOLD';

    const since = new Date(Date.now() - this.BUCKET_WINDOW_MIN * 60 * 1000);
    const recent = await this.prisma.usageMetric.findMany({
      where: {
        subscriptionId: sub.id,
        bucketStart: { gte: since },
      },
      orderBy: { bucketStart: 'desc' },
      take: this.BUCKET_WINDOW_MIN,
    });

    if (recent.length < 3) return 'HOLD';

    const baseCpu = sub.plan.cpuLimit;
    const baseRam = sub.plan.ramLimitMb;
    const baseDisk = sub.plan.diskLimitMb;
    const scaledCpu = sub.account.scaledCpu;
    const scaledRamMb = sub.account.scaledRamMb;
    const scaledDiskMb = sub.account.scaledDiskMb;
    const effCpu = baseCpu + scaledCpu;
    const effRam = baseRam + scaledRamMb;
    const effDisk = baseDisk + scaledDiskMb;

    const cpuMove = this.applyResourceMove(
      this.decideMove({
        avgs: recent.map((r) => r.cpuUsageAvg),
        effective: effCpu,
        base: baseCpu,
        currentScaled: scaledCpu,
        pressureFloor: this.UP_CPU_PRESSURE_FLOOR,
        maxOverscaleRatio: this.resolveMaxOverscaleRatio(sub.plan.autoscalingMaxOverscaleCpu),
      }),
      sub.autoscalingScaleCpu,
    );

    const ramMove = this.applyResourceMove(
      this.decideMove({
        avgs: recent.map((r) => r.memUsageAvgMb),
        effective: effRam,
        base: baseRam,
        currentScaled: scaledRamMb,
        pressureFloor: this.UP_RAM_PRESSURE_FLOOR_MB,
        maxOverscaleRatio: this.resolveMaxOverscaleRatio(sub.plan.autoscalingMaxOverscaleRam),
      }),
      sub.autoscalingScaleRam,
    );

    const diskMove = this.applyResourceMove(
      this.decideMove({
        avgs: recent.map((r) => r.diskUsageMb),
        effective: effDisk,
        base: baseDisk,
        currentScaled: scaledDiskMb,
        pressureFloor: this.UP_DISK_PRESSURE_FLOOR_MB,
        maxOverscaleRatio: this.resolveMaxOverscaleRatio(sub.plan.autoscalingMaxOverscaleDisk),
      }),
      sub.autoscalingScaleDisk,
    );

    if (cpuMove === 0 && ramMove === 0 && diskMove === 0) return 'HOLD';

    const isUp = cpuMove > 0 || ramMove > 0 || diskMove > 0;
    const nextScaledCpu = scaledCpu + cpuMove;
    const nextScaledRamMb = scaledRamMb + ramMove;
    const nextScaledDiskMb = scaledDiskMb + diskMove;

    if (isUp) {
      const guard = await this.guardScaleUp(
        sub,
        rules,
        nextScaledCpu,
        nextScaledRamMb,
        nextScaledDiskMb,
      );
      if (guard.allowed === false) {
        const blockReason = guard.reason;
        await this.recordDisabled(sub, recent, blockReason);
        if (scaledCpu > 0 || scaledRamMb > 0 || scaledDiskMb > 0) {
          await this.applyChange(sub, {
            recent,
            nextScaledCpu: 0,
            nextScaledRamMb: 0,
            nextScaledDiskMb: 0,
            reason: blockReason,
            direction: AutoscalingDirection.DOWN,
            disable: true,
            rules,
          });
        }
        return 'DISABLED';
      }
    }

    const direction = isUp ? AutoscalingDirection.UP : AutoscalingDirection.DOWN;
    await this.applyChange(sub, {
      recent,
      nextScaledCpu,
      nextScaledRamMb,
      nextScaledDiskMb,
      reason: this.describeReason(recent, effCpu, effRam, effDisk, isUp),
      direction,
      disable: false,
      rules,
    });

    return isUp ? 'UP' : 'DOWN';
  }

  private applyResourceMove(rawMove: number, scalingEnabled: boolean): number {
    if (scalingEnabled) return rawMove;
    return rawMove < 0 ? rawMove : 0;
  }

  private resolveMaxOverscaleRatio(value: number): number {
    if (!Number.isFinite(value) || value < 1) return this.DEFAULT_MAX_OVERSCALE_RATIO;
    return Math.min(value, 10);
  }

  private decideMove(opts: {
    avgs: number[];
    effective: number;
    base: number;
    currentScaled: number;
    pressureFloor: number;
    maxOverscaleRatio: number;
  }): number {
    const { avgs, effective, base, currentScaled, pressureFloor, maxOverscaleRatio } =
      opts;
    if (effective <= 0 || base <= 0) return 0;

    const upHits = avgs.filter(
      (v) => v >= pressureFloor && v >= effective * this.UP_PRESSURE_RATIO,
    ).length;
    const downHits = avgs.filter((v) => v <= effective * this.DOWN_RELAX_RATIO).length;

    const step = Math.max(1, Math.ceil(base * this.SCALE_STEP_RATIO));
    const ceilingScaled = base * (maxOverscaleRatio - 1);

    if (upHits >= this.UP_HITS_REQUIRED) {
      const next = Math.min(currentScaled + step, ceilingScaled);
      return next - currentScaled;
    }

    if (downHits >= this.DOWN_HITS_REQUIRED && currentScaled > 0) {
      const next = Math.max(0, currentScaled - step);
      return next - currentScaled;
    }

    return 0;
  }

  private async applyChange(
    sub: Subscription & {
      account: Account | null;
      plan: Plan;
      user: { email: string; firstName: string | null };
    },
    opts: {
      recent: UsageMetric[];
      nextScaledCpu: number;
      nextScaledRamMb: number;
      nextScaledDiskMb: number;
      reason: string;
      direction: AutoscalingDirection;
      disable: boolean;
      rules: AutoscalingPriceRule[];
    },
  ) {
    if (!sub.account) return;

    const now = new Date();
    const baseCpu = sub.plan.cpuLimit;
    const baseRam = sub.plan.ramLimitMb;
    const baseDisk = sub.plan.diskLimitMb;
    const newCpuLimit = baseCpu + opts.nextScaledCpu;
    const newRamLimit = baseRam + opts.nextScaledRamMb;
    const newDiskLimit = baseDisk + opts.nextScaledDiskMb;

    const wasScaled =
      sub.account.scaledCpu > 0 ||
      sub.account.scaledRamMb > 0 ||
      sub.account.scaledDiskMb > 0;
    const nowScaled =
      opts.nextScaledCpu > 0 || opts.nextScaledRamMb > 0 || opts.nextScaledDiskMb > 0;
    const episodeStart = !wasScaled && nowScaled;
    const episodeEnd = wasScaled && !nowScaled;
    const episodeSince = sub.account.scaledSince;

    try {
      const client = await this.da.getClientForServer(sub.account.serverId);
      await client.setAccountLimits(sub.account.daUsername, {
        cpuPercent: newCpuLimit,
        memoryMb: newRamLimit,
        diskQuotaMb: newDiskLimit,
        ioKbps: sub.plan.ioLimitKbps,
        iops: sub.plan.iopsLimit,
        entryProcesses: sub.plan.entryProcesses,
        nproc: sub.plan.nprocLimit,
      });
    } catch (err) {
      this.logger.error(
        `Autoscaling: DA setAccountLimits failed for sub=${sub.id} ` +
          `(${sub.account.daUsername}): ${(err as Error).message}`,
      );
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: sub.account!.id },
        data: {
          scaledCpu: opts.nextScaledCpu,
          scaledRamMb: opts.nextScaledRamMb,
          scaledDiskMb: opts.nextScaledDiskMb,
          cpuLimit: newCpuLimit,
          ramLimitMb: newRamLimit,
          diskLimitMb: newDiskLimit,
          // Open/close the block-billing episode in lockstep with the delta.
          ...(episodeStart ? { scaledSince: now, scaledBilledUntil: now } : {}),
          ...(episodeEnd ? { scaledSince: null, scaledBilledUntil: null } : {}),
        },
      });

      const resourceChanges: Array<{
        resource: AutoscalingResource;
        from: number;
        to: number;
      }> = [];

      if (sub.account!.scaledCpu !== opts.nextScaledCpu) {
        resourceChanges.push({
          resource: AutoscalingResource.CPU,
          from: sub.account!.scaledCpu,
          to: opts.nextScaledCpu,
        });
      }
      if (sub.account!.scaledRamMb !== opts.nextScaledRamMb) {
        resourceChanges.push({
          resource: AutoscalingResource.RAM,
          from: sub.account!.scaledRamMb,
          to: opts.nextScaledRamMb,
        });
      }
      if (sub.account!.scaledDiskMb !== opts.nextScaledDiskMb) {
        resourceChanges.push({
          resource: AutoscalingResource.DISK,
          from: sub.account!.scaledDiskMb,
          to: opts.nextScaledDiskMb,
        });
      }

      for (const change of resourceChanges) {
        await tx.autoscalingEvent.create({
          data: {
            subscriptionId: sub.id,
            direction: opts.direction,
            resource: change.resource,
            fromValue: change.from,
            toValue: change.to,
            reason: opts.reason,
          },
        });
      }

      if (opts.disable) {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            autoscalingEnabled: false,
            autoscalingDisabledReason:
              opts.reason.startsWith('cap_reached')
                ? 'CAP_REACHED'
                : opts.reason.startsWith('wallet_empty')
                  ? 'WALLET_EMPTY'
                  : 'AUTO_DISABLED',
          },
        });

        await tx.autoscalingEvent.create({
          data: {
            subscriptionId: sub.id,
            direction: AutoscalingDirection.DISABLED,
            reason: opts.reason,
          },
        });
      }
    });

    await this.audit.record({
      action: opts.disable ? 'AUTOSCALING_AUTO_DISABLED' : 'AUTOSCALING_LIMITS_UPDATED',
      userId: sub.userId,
      details: {
        subscriptionId: sub.id,
        direction: opts.direction,
        previousScaledCpu: sub.account.scaledCpu,
        nextScaledCpu: opts.nextScaledCpu,
        previousScaledRamMb: sub.account.scaledRamMb,
        nextScaledRamMb: opts.nextScaledRamMb,
        previousScaledDiskMb: sub.account.scaledDiskMb,
        nextScaledDiskMb: opts.nextScaledDiskMb,
        reason: opts.reason,
      },
    });

    // Bill immediately while scaled so even a brief spike that reverts before
    // the next cron tick still pays its first 15-minute block. Idempotent with
    // the scheduler, so this never double-bills.
    if (nowScaled) {
      try {
        await this.billing.billDueBlocks(
          {
            id: sub.account.id,
            subscriptionId: sub.id,
            userId: sub.userId,
            domain: sub.account.domain,
            scaledCpu: opts.nextScaledCpu,
            scaledRamMb: opts.nextScaledRamMb,
            scaledDiskMb: opts.nextScaledDiskMb,
            scaledSince: episodeStart ? now : episodeSince,
            scaledBilledUntil: episodeStart ? now : sub.account.scaledBilledUntil,
          },
          opts.rules,
          now,
        );
      } catch (err) {
        this.logger.error(
          `Autoscaling immediate block billing failed sub=${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    const panelUrl =
      this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const autoscalingUrl = `${panelUrl}/dashboard/services/${sub.id}/autoscaling`;
    const domain = sub.account.domain;

    // ONE email when the episode begins (no per-resource / per-tick spam).
    if (episodeStart && !opts.disable) {
      const deltas: AutoscalingResourceDelta[] = [];
      if (opts.nextScaledCpu > 0)
        deltas.push({ resource: AutoscalingResource.CPU, toValue: opts.nextScaledCpu });
      if (opts.nextScaledRamMb > 0)
        deltas.push({ resource: AutoscalingResource.RAM, toValue: opts.nextScaledRamMb });
      if (opts.nextScaledDiskMb > 0)
        deltas.push({ resource: AutoscalingResource.DISK, toValue: opts.nextScaledDiskMb });
      const hourlyCostPln = this.estimateHourlyCost(
        opts.rules,
        opts.nextScaledCpu,
        opts.nextScaledRamMb,
        opts.nextScaledDiskMb,
      );
      void this.mailer
        .send(
          autoscalingStartedTemplate({
            to: sub.user.email,
            userId: sub.userId,
            firstName: sub.user.firstName,
            domain,
            deltas,
            hourlyCostPln,
            blockCostPln: hourlyCostPln * (BILLING_BLOCK_MINUTES / 60),
            blockMinutes: BILLING_BLOCK_MINUTES,
            panelUrl,
            autoscalingUrl,
          }),
        )
        .catch((err) => {
          this.logger.warn(
            `Autoscaling started mail failed sub=${sub.id}: ${(err as Error).message}`,
          );
        });
    }

    // ONE summary email when everything returns to the baseline plan.
    if (episodeEnd) {
      const durationMinutes = episodeSince
        ? (now.getTime() - episodeSince.getTime()) / 60_000
        : BILLING_BLOCK_MINUTES;
      const totalCostPln = episodeSince
        ? await this.billing.episodeSpendPln(sub.id, episodeSince).catch(() => 0)
        : 0;
      const reason: AutoscalingEndReason = opts.disable
        ? opts.reason.startsWith('cap_reached')
          ? 'CAP_REACHED'
          : opts.reason.startsWith('wallet_empty')
            ? 'WALLET_EMPTY'
            : 'AUTO_DISABLED'
        : 'RELAXED';
      void this.mailer
        .send(
          autoscalingEndedTemplate({
            to: sub.user.email,
            userId: sub.userId,
            firstName: sub.user.firstName,
            domain,
            durationMinutes,
            totalCostPln,
            reason,
            panelUrl,
            autoscalingUrl,
          }),
        )
        .catch((err) => {
          this.logger.warn(
            `Autoscaling ended mail failed sub=${sub.id}: ${(err as Error).message}`,
          );
        });
    }
  }

  private async guardScaleUp(
    sub: Subscription & { user: { walletBalance: Prisma.Decimal } },
    rules: AutoscalingPriceRule[],
    nextScaledCpu: number,
    nextScaledRamMb: number,
    nextScaledDiskMb: number,
  ): Promise<{ allowed: true } | { allowed: false; reason: string }> {
    const balance = Number(sub.user.walletBalance);
    if (balance < this.MIN_WALLET_BALANCE) {
      return { allowed: false, reason: 'wallet_empty' };
    }

    const cap = Number(sub.autoscalingMaxCost);
    if (cap > 0) {
      const spent = await this.thirtyDaySpend(sub.id);
      const projectedHourly = this.estimateHourlyCost(
        rules,
        nextScaledCpu,
        nextScaledRamMb,
        nextScaledDiskMb,
      );
      if (spent + projectedHourly > cap) {
        return { allowed: false, reason: 'cap_reached' };
      }
    }

    return { allowed: true };
  }

  private async thirtyDaySpend(subscriptionId: string): Promise<number> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sum = await this.prisma.walletTransaction.aggregate({
      where: {
        subscriptionId,
        type: 'CHARGE_AUTOSCALING',
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    });
    return Number(sum._sum.amount ?? 0);
  }

  estimateHourlyCost(
    rules: AutoscalingPriceRule[],
    scaledCpu: number,
    scaledRamMb: number,
    scaledDiskMb = 0,
  ): number {
    return hourlyCostForCatalogAmounts(rules, {
      cpuPercent: scaledCpu,
      ramGb: scaledRamMbToCatalogGb(scaledRamMb),
      diskGb: scaledDiskMbToCatalogGb(scaledDiskMb),
    });
  }

  private describeReason(
    recent: UsageMetric[],
    effCpu: number,
    effRam: number,
    effDisk: number,
    isUp: boolean,
  ): string {
    const n = Math.max(1, recent.length);
    const avgCpu = recent.reduce((acc, r) => acc + r.cpuUsageAvg, 0) / n;
    const avgRam = recent.reduce((acc, r) => acc + r.memUsageAvgMb, 0) / n;
    const avgDisk = recent.reduce((acc, r) => acc + r.diskUsageMb, 0) / n;
    const cpuPct = effCpu > 0 ? Math.round((avgCpu / effCpu) * 100) : 0;
    const ramPct = effRam > 0 ? Math.round((avgRam / effRam) * 100) : 0;
    const diskPct = effDisk > 0 ? Math.round((avgDisk / effDisk) * 100) : 0;
    return isUp
      ? `pressure cpu_avg=${cpuPct}pct_eff ram_avg=${ramPct}pct_eff disk_avg=${diskPct}pct_eff buckets=${recent.length}`
      : `slack cpu_avg=${cpuPct}pct_eff ram_avg=${ramPct}pct_eff disk_avg=${diskPct}pct_eff buckets=${recent.length}`;
  }

  private async recordDisabled(
    sub: Subscription,
    recent: UsageMetric[],
    reason: string,
  ): Promise<void> {
    this.logger.warn(
      `Autoscaling blocked for sub=${sub.id} reason=${reason} buckets=${recent.length}`,
    );
  }
}
