import { Injectable, Logger } from '@nestjs/common';
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
} from '@ekohost/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DirectAdminService } from '../servers/directadmin.service';

/**
 * Autoscaling engine — the heart of EPIC D.
 *
 * Runs every minute, walks every ACTIVE subscription that has autoscaling
 * enabled, and decides whether to:
 *   - SCALE_UP   — sustained pressure across the last 5 buckets,
 *   - SCALE_DOWN — sustained slack and we previously scaled up,
 *   - HOLD       — no action,
 *   - DISABLED   — wallet is empty / monthly cap exhausted; we drop everything
 *                  back to the plan baseline and stop further upscaling.
 *
 * Decisions translate into:
 *   1. A `lvectl`-equivalent call against DirectAdmin (`setAccountLimits`),
 *   2. Updated `Account.scaledCpu/scaledRamMb` and `Account.cpuLimit/ramLimitMb`
 *      so the panel always reflects the live LVE state,
 *   3. An `AutoscalingEvent` row + audit log entry for forensics.
 *
 * The engine is intentionally idempotent: if it can't make progress (e.g. DA
 * is unreachable, or the wallet check fails), it logs and bails. The next tick
 * will retry.
 */
@Injectable()
export class AutoscalingEngineService {
  private readonly logger = new Logger(AutoscalingEngineService.name);

  // Tunables — kept here on purpose so they're trivial to revisit when we
  // collect production data. Move to AppConfig if/when product wants knobs.
  private readonly BUCKET_WINDOW_MIN = 5;
  private readonly UP_PRESSURE_RATIO = 0.8; // ≥80% utilisation = pressure
  private readonly DOWN_RELAX_RATIO = 0.3; // <30% utilisation = slack
  private readonly UP_HITS_REQUIRED = 3; // out of last 5 buckets
  private readonly DOWN_HITS_REQUIRED = 5; // all 5 buckets relaxed
  private readonly SCALE_STEP_RATIO = 0.25; // grow/shrink by 25 % of plan baseline
  private readonly MAX_OVERSCALE_RATIO = 3; // never go beyond 3× plan baseline
  private readonly UP_CPU_PRESSURE_FLOOR = 5; // require avg ≥5 CPU% absolute
  private readonly UP_RAM_PRESSURE_FLOOR_MB = 64; // require avg ≥64 MB absolute
  private readonly MIN_WALLET_BALANCE = 1; // at least 1 PLN to allow a SCALE_UP

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly da: DirectAdminService,
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
      include: { account: true, plan: true, user: { select: { walletBalance: true } } },
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

  // ---------------------------------------------------------------------------
  // Core decision flow per subscription
  // ---------------------------------------------------------------------------

  private async evaluate(
    sub: Subscription & {
      account: Account | null;
      plan: Plan;
      user: { walletBalance: Prisma.Decimal };
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

    // Without enough samples we hold — decisions on 1-2 buckets are too noisy
    // and the very first 5 minutes after provisioning would otherwise jitter.
    if (recent.length < 3) return 'HOLD';

    const baseCpu = sub.plan.cpuLimit;
    const baseRam = sub.plan.ramLimitMb;
    const scaledCpu = sub.account.scaledCpu;
    const scaledRamMb = sub.account.scaledRamMb;
    const effCpu = baseCpu + scaledCpu;
    const effRam = baseRam + scaledRamMb;

    // Decide per resource. We treat CPU and RAM independently — it's perfectly
    // fine to scale CPU up while keeping RAM unchanged.
    const cpuMove = this.decideMove({
      avgs: recent.map((r) => r.cpuUsageAvg),
      effective: effCpu,
      base: baseCpu,
      currentScaled: scaledCpu,
      pressureFloor: this.UP_CPU_PRESSURE_FLOOR,
    });

    const ramMove = this.decideMove({
      avgs: recent.map((r) => r.memUsageAvgMb),
      effective: effRam,
      base: baseRam,
      currentScaled: scaledRamMb,
      pressureFloor: this.UP_RAM_PRESSURE_FLOOR_MB,
    });

    if (cpuMove === 0 && ramMove === 0) return 'HOLD';

    // ---- D-7 guards: never scale up if we can't safely bill the customer ----

    let isUp = cpuMove > 0 || ramMove > 0;
    let nextScaledCpu = scaledCpu + cpuMove;
    let nextScaledRamMb = scaledRamMb + ramMove;

    if (isUp) {
      const guard = await this.guardScaleUp(sub, rules, nextScaledCpu, nextScaledRamMb);
      if (guard.allowed === false) {
        const blockReason = guard.reason;
        await this.recordDisabled(sub, recent, blockReason);
        // Bring effective back to baseline if currently scaled up.
        if (scaledCpu > 0 || scaledRamMb > 0) {
          await this.applyChange(sub, {
            recent,
            nextScaledCpu: 0,
            nextScaledRamMb: 0,
            reason: blockReason,
            direction: AutoscalingDirection.DOWN,
            disable: true,
          });
        }
        return 'DISABLED';
      }
    }

    // Direction = UP if either resource grew; DOWN if both shrunk; otherwise UP wins
    // (we treat any growth as UP for accounting/event purposes).
    const direction = isUp ? AutoscalingDirection.UP : AutoscalingDirection.DOWN;
    await this.applyChange(sub, {
      recent,
      nextScaledCpu,
      nextScaledRamMb,
      reason: this.describeReason(recent, effCpu, effRam, isUp),
      direction,
      disable: false,
    });

    return isUp ? 'UP' : 'DOWN';
  }

  /**
   * Returns the *delta* to add to the current scaled value:
   *   > 0 → scale up,
   *   < 0 → scale down,
   *   = 0 → hold.
   */
  private decideMove(opts: {
    avgs: number[];
    effective: number;
    base: number;
    currentScaled: number;
    pressureFloor: number;
  }): number {
    const { avgs, effective, base, currentScaled, pressureFloor } = opts;
    if (effective <= 0) return 0;

    const upHits = avgs.filter(
      (v) => v >= pressureFloor && v >= effective * this.UP_PRESSURE_RATIO,
    ).length;
    const downHits = avgs.filter((v) => v <= effective * this.DOWN_RELAX_RATIO).length;

    const step = Math.max(1, Math.ceil(base * this.SCALE_STEP_RATIO));
    const ceilingScaled = base * (this.MAX_OVERSCALE_RATIO - 1);

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

  // ---------------------------------------------------------------------------
  // Apply / persist
  // ---------------------------------------------------------------------------

  private async applyChange(
    sub: Subscription & { account: Account | null; plan: Plan },
    opts: {
      recent: UsageMetric[];
      nextScaledCpu: number;
      nextScaledRamMb: number;
      reason: string;
      direction: AutoscalingDirection;
      disable: boolean;
    },
  ) {
    if (!sub.account) return;

    const baseCpu = sub.plan.cpuLimit;
    const baseRam = sub.plan.ramLimitMb;
    const newCpuLimit = baseCpu + opts.nextScaledCpu;
    const newRamLimit = baseRam + opts.nextScaledRamMb;

    // 1. Push the new limits to the node first. If DA refuses (server down,
    //    misconfigured DA creds, etc.) we abort the DB update so the panel
    //    keeps reflecting reality.
    try {
      const client = await this.da.getClientForServer(sub.account.serverId);
      await client.setAccountLimits(sub.account.daUsername, {
        cpuPercent: newCpuLimit,
        memoryMb: newRamLimit,
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
      return; // skip DB update — try again on next tick
    }

    // 2. Persist account state + autoscaling event in one transaction.
    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: sub.account!.id },
        data: {
          scaledCpu: opts.nextScaledCpu,
          scaledRamMb: opts.nextScaledRamMb,
          cpuLimit: newCpuLimit,
          ramLimitMb: newRamLimit,
        },
      });

      // Emit one event per resource that changed — the panel timeline reads
      // these one-by-one and renders them as separate rows.
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
        reason: opts.reason,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // D-7 guard: wallet balance & monthly cap
  // ---------------------------------------------------------------------------

  /**
   * Returns whether a subscription can scale up *right now*. Two checks:
   *   1. Customer has at least `MIN_WALLET_BALANCE` PLN in the wallet,
   *   2. Projected monthly autoscaling spend (current 30-day spend + cost of
   *      one extra hour at the new scaling level) does not exceed the
   *      customer-configured cap (if cap > 0; cap=0 means no cap).
   */
  private async guardScaleUp(
    sub: Subscription & { user: { walletBalance: Prisma.Decimal } },
    rules: AutoscalingPriceRule[],
    nextScaledCpu: number,
    nextScaledRamMb: number,
  ): Promise<{ allowed: true } | { allowed: false; reason: string }> {
    const balance = Number(sub.user.walletBalance);
    if (balance < this.MIN_WALLET_BALANCE) {
      return { allowed: false, reason: 'wallet_empty' };
    }

    const cap = Number(sub.autoscalingMaxCost);
    if (cap > 0) {
      const spent = await this.thirtyDaySpend(sub.id);
      const projectedHourly = this.estimateHourlyCost(rules, nextScaledCpu, nextScaledRamMb);
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

  /**
   * Returns the projected hourly cost for the given scaled deltas, using the
   * highest-threshold matching active rule per resource.
   */
  estimateHourlyCost(
    rules: AutoscalingPriceRule[],
    scaledCpu: number,
    scaledRamMb: number,
  ): number {
    const pick = (resource: AutoscalingResource, units: number): number => {
      if (units <= 0) return 0;
      const candidates = rules
        .filter((r) => r.resource === resource)
        .sort((a, b) => b.thresholdAbove - a.thresholdAbove);
      const match = candidates.find((r) => units >= r.thresholdAbove) ?? candidates[0];
      if (!match) return 0;
      return units * Number(match.pricePerUnit);
    };
    return pick(AutoscalingResource.CPU, scaledCpu) + pick(AutoscalingResource.RAM, scaledRamMb);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private describeReason(
    recent: UsageMetric[],
    effCpu: number,
    effRam: number,
    isUp: boolean,
  ): string {
    const avgCpu =
      recent.reduce((acc, r) => acc + r.cpuUsageAvg, 0) / Math.max(1, recent.length);
    const avgRam =
      recent.reduce((acc, r) => acc + r.memUsageAvgMb, 0) / Math.max(1, recent.length);
    const cpuPct = effCpu > 0 ? Math.round((avgCpu / effCpu) * 100) : 0;
    const ramPct = effRam > 0 ? Math.round((avgRam / effRam) * 100) : 0;
    return isUp
      ? `pressure cpu_avg=${cpuPct}pct_eff ram_avg=${ramPct}pct_eff buckets=${recent.length}`
      : `slack cpu_avg=${cpuPct}pct_eff ram_avg=${ramPct}pct_eff buckets=${recent.length}`;
  }

  private async recordDisabled(
    sub: Subscription,
    recent: UsageMetric[],
    reason: string,
  ): Promise<void> {
    // Light-weight signalling for engine-level "would have scaled but couldn't"
    // — also useful for showing customer-facing CTA "doładuj portfel by włączyć".
    this.logger.warn(
      `Autoscaling blocked for sub=${sub.id} reason=${reason} buckets=${recent.length}`,
    );
  }
}
