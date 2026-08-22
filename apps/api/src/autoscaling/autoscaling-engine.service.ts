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
import {
  krotnoscAutoskalowania,
  PojemnoscFizyczna,
  SWIEZOSC_TELEMETRII_MIN,
  wolneDoZadysponowania,
} from '../subscriptions/node-capacity';
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
    // Z-16: cpu i ram też są mutowalne — ogranicznik pojemności węzła może je
    // przyciąć, tak jak podłoga dyskowa (F-06) przycina dysk.
    let nextScaledCpu = scaledCpu + cpuMove;
    let nextScaledRamMb = scaledRamMb + ramMove;
    let nextScaledDiskMb = scaledDiskMb + diskMove;

    // Audit F-06: CPU/RAM are ephemeral, disk is NOT. Never shrink the disk
    // quota below what the customer is actually using (+5% headroom) — an
    // over-quota account breaks writes for websites, mail and cron.
    if (diskMove < 0) {
      const floor = this.minScaledDiskMb(recent, baseDisk);
      if (nextScaledDiskMb < floor) {
        nextScaledDiskMb = Math.min(scaledDiskMb, floor);
      }
    }

    if (
      nextScaledCpu === scaledCpu &&
      nextScaledRamMb === scaledRamMb &&
      nextScaledDiskMb === scaledDiskMb
    ) {
      return 'HOLD';
    }

    // Z-16 — zanim cokolwiek obiecamy klientowi, sprawdź, czy węzeł to ma.
    //
    // To NIE jest odmowa w rozumieniu guardScaleUp: brak pojemności węzła nie
    // jest winą klienta i nie może wyłączać mu autoskalowania ani ściągać konta
    // do baseline. Przycinamy przyrost do tego, co węzeł faktycznie ma, i tyle.
    if (isUp) {
      const limit = await this.ogranicznikPojemnosciWezla(sub, {
        cpu: nextScaledCpu - scaledCpu,
        ramMb: nextScaledRamMb - scaledRamMb,
        diskMb: nextScaledDiskMb - scaledDiskMb,
      });

      const poObcieciu = {
        cpu: scaledCpu + limit.przyznane.cpu,
        ramMb: scaledRamMb + limit.przyznane.ramMb,
        diskMb: scaledDiskMb + limit.przyznane.diskMb,
      };

      if (limit.obciete) {
        this.logger.warn(
          `Autoscaling: węzeł ${limit.serverId} nie ma pełnej nadwyżki dla sub=${sub.id} — ` +
            `przyznano cpu=${limit.przyznane.cpu}/${nextScaledCpu - scaledCpu}, ` +
            `ram=${limit.przyznane.ramMb}/${nextScaledRamMb - scaledRamMb}MB, ` +
            `disk=${limit.przyznane.diskMb}/${nextScaledDiskMb - scaledDiskMb}MB` +
            (limit.telemetriaSwieza ? '' : ' (telemetria nieświeża — nadsubskrypcja zdegradowana)'),
        );
        await this.audit.record({
          action: 'AUTOSCALING_OGRANICZONE_POJEMNOSCIA_WEZLA',
          userId: sub.userId,
          details: {
            subscriptionId: sub.id,
            serverId: limit.serverId,
            chciane: {
              cpu: nextScaledCpu - scaledCpu,
              ramMb: nextScaledRamMb - scaledRamMb,
              diskMb: nextScaledDiskMb - scaledDiskMb,
            },
            przyznane: {
              cpu: limit.przyznane.cpu,
              ramMb: limit.przyznane.ramMb,
              diskMb: limit.przyznane.diskMb,
            },
            telemetriaSwieza: limit.telemetriaSwieza,
            note:
              'Konto nie dostało pełnej nadwyżki, bo węzeł jej nie ma. To sygnał do dołożenia węzła — klient nie jest niczemu winien.',
          } as Prisma.InputJsonValue,
        });
      }

      nextScaledCpu = poObcieciu.cpu;
      nextScaledRamMb = poObcieciu.ramMb;
      nextScaledDiskMb = poObcieciu.diskMb;

      // Cała nadwyżka obcięta do zera — nie ma czego stosować ani za co liczyć.
      if (
        nextScaledCpu === scaledCpu &&
        nextScaledRamMb === scaledRamMb &&
        nextScaledDiskMb === scaledDiskMb
      ) {
        return 'HOLD';
      }

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
          // Forced return to baseline — but the disk floor still applies
          // (audit F-06). If the customer's data exceeds the plan quota, we
          // hold the disk delta, flag it for BOK in the audit log and keep
          // billing the remaining delta block-by-block once funds appear.
          const diskFloor = this.minScaledDiskMb(recent, baseDisk);
          const heldDiskMb = Math.min(scaledDiskMb, diskFloor);
          if (heldDiskMb > 0) {
            await this.audit.record({
              action: 'AUTOSCALING_DISK_FLOOR_HELD',
              userId: sub.userId,
              details: {
                subscriptionId: sub.id,
                reason: blockReason,
                heldScaledDiskMb: heldDiskMb,
                baseDiskMb: baseDisk,
                note:
                  'Wymuszony powrót do baseline zatrzymany na poziomie faktycznego zużycia dysku — wymaga kontaktu BOK (zwolnienie miejsca lub upgrade planu).',
              },
            });
          }
          await this.applyChange(sub, {
            recent,
            nextScaledCpu: 0,
            nextScaledRamMb: 0,
            nextScaledDiskMb: heldDiskMb,
            reason: heldDiskMb > 0 ? `${blockReason} disk_floor_held` : blockReason,
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

  /**
   * Audit F-06: the minimum `scaledDiskMb` an account may be reduced to so the
   * effective quota (plan base + delta) stays >= the customer's real usage
   * with 5% headroom. 0 when usage fits the base plan.
   */
  private minScaledDiskMb(recent: UsageMetric[], baseDiskMb: number): number {
    if (recent.length === 0) return 0;
    const maxUsage = Math.max(...recent.map((r) => r.diskUsageMb ?? 0));
    if (maxUsage <= 0) return 0;
    const required = Math.ceil(maxUsage * 1.05);
    return Math.max(0, required - baseDiskMb);
  }

  /**
   * Z-16 — krotność bierzemy z planu, a nie z ukrytego sufitu 10× wpisanego
   * w silnik. Ten sufit sprawiał, że oferta („skalowanie do 24 vCPU i 1000 GB")
   * była nieosiągalna: realnie dawał 20 vCPU i 500 GB.
   *
   * Podniesienie progu jest bezpieczne DOPIERO dlatego, że skalowanie w górę
   * przechodzi teraz przez `ogranicznikPojemnosciWezla`. Bez tego kroku wyższy
   * sufit tylko powiększyłby promień rażenia.
   */
  private resolveMaxOverscaleRatio(value: number): number {
    return krotnoscAutoskalowania(value);
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
      // Z-16 — nadwyżka wchodzi do księgi węzła.
      //
      // Do tej pory autoskalowanie podnosiło limity w DirectAdminie i nie
      // zapisywało tego nigdzie, więc NodeSelector nadal widział wyłącznie
      // limity bazowe. Dwie warstwy nadsubskrybowały ten sam węzeł, nie
      // wiedząc o sobie. Delty idą przez `increment`, nie przez zapis wartości,
      // żeby równoległy provisioning niczego nie zgubił.
      const deltaCpu = opts.nextScaledCpu - sub.account!.scaledCpu;
      const deltaRam = opts.nextScaledRamMb - sub.account!.scaledRamMb;
      const deltaDisk = opts.nextScaledDiskMb - sub.account!.scaledDiskMb;
      if (deltaCpu !== 0 || deltaRam !== 0 || deltaDisk !== 0) {
        await tx.server.update({
          where: { id: sub.account!.serverId },
          data: {
            ...(deltaCpu !== 0 ? { allocatedCpu: { increment: deltaCpu } } : {}),
            ...(deltaRam !== 0 ? { allocatedMemory: { increment: deltaRam } } : {}),
            ...(deltaDisk !== 0 ? { allocatedDisk: { increment: deltaDisk } } : {}),
          },
        });
      }

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

  /**
   * Z-16 — ile z żądanego przyrostu węzeł jest w stanie realnie dać.
   *
   * Zwraca przyrost PRZYCIĘTY do wolnej pojemności węzła. Nigdy nie zwraca
   * wartości ujemnych: brak miejsca oznacza „nie rośnij", a nie „zabierz
   * klientowi to, co już ma".
   *
   * Węzeł bez zaraportowanej pojemności przepuszcza żądanie bez zmian —
   * inaczej awaria handshake'u zatrzymałaby autoskalowanie całej floty.
   * To jest świadomy kompromis: brak danych o węźle jest problemem
   * operacyjnym, a nie powodem, żeby klient nie dostał mocy, za którą płaci.
   */
  private async ogranicznikPojemnosciWezla(
    sub: Subscription & { account: Account | null },
    chciany: PojemnoscFizyczna,
  ): Promise<{
    serverId: string | null;
    przyznane: PojemnoscFizyczna;
    obciete: boolean;
    telemetriaSwieza: boolean;
  }> {
    const bezZmian = {
      serverId: sub.account?.serverId ?? null,
      przyznane: chciany,
      obciete: false,
      telemetriaSwieza: false,
    };
    if (!sub.account) return bezZmian;

    const server = await this.prisma.server.findUnique({
      where: { id: sub.account.serverId },
    });
    if (!server) return bezZmian;

    const fizyczna: PojemnoscFizyczna = {
      cpu: (server.totalCpuCores ?? 0) * 100,
      ramMb: server.totalMemoryMb ?? 0,
      diskMb: server.totalDiskMb ?? 0,
    };
    if (fizyczna.cpu <= 0 || fizyczna.ramMb <= 0 || fizyczna.diskMb <= 0) {
      return bezZmian;
    }

    const zuzycie = await this.realneZuzycieWezla(server.id);

    const wolne = wolneDoZadysponowania({
      fizyczna,
      sprzedane: {
        cpu: server.allocatedCpu,
        ramMb: server.allocatedMemory,
        diskMb: server.allocatedDisk,
      },
      zuzycie,
      polityka: {
        overcommitCpu: server.overcommitCpu,
        overcommitRam: server.overcommitRam,
        overcommitDisk: server.overcommitDisk,
        reservedHeadroomPercent: server.reservedHeadroomPercent,
      },
    });

    const przyznane: PojemnoscFizyczna = {
      cpu: Math.max(0, Math.min(chciany.cpu, Math.floor(wolne.cpu))),
      ramMb: Math.max(0, Math.min(chciany.ramMb, Math.floor(wolne.ramMb))),
      diskMb: Math.max(0, Math.min(chciany.diskMb, Math.floor(wolne.diskMb))),
    };

    return {
      serverId: server.id,
      przyznane,
      obciete:
        przyznane.cpu !== chciany.cpu ||
        przyznane.ramMb !== chciany.ramMb ||
        przyznane.diskMb !== chciany.diskMb,
      telemetriaSwieza: zuzycie !== null,
    };
  }

  /**
   * Realne zużycie węzła — po jednej najnowszej próbce na subskrypcję.
   * `null`, gdy w oknie świeżości nic nie przyszło; wtedy `node-capacity`
   * degraduje nadsubskrypcję do 1,0×.
   */
  private async realneZuzycieWezla(serverId: string): Promise<PojemnoscFizyczna | null> {
    const od = new Date(Date.now() - SWIEZOSC_TELEMETRII_MIN * 60_000);
    const rows = await this.prisma.usageMetric.findMany({
      where: { serverId, bucketStart: { gte: od } },
      select: {
        subscriptionId: true,
        bucketStart: true,
        cpuUsageMax: true,
        memUsageMaxMb: true,
        diskUsageMb: true,
      },
      orderBy: { bucketStart: 'desc' },
    });
    if (rows.length === 0) return null;

    const najnowsza = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const klucz = r.subscriptionId ?? 'brak';
      const dotad = najnowsza.get(klucz);
      if (!dotad || r.bucketStart > dotad.bucketStart) najnowsza.set(klucz, r);
    }

    const suma: PojemnoscFizyczna = { cpu: 0, ramMb: 0, diskMb: 0 };
    for (const r of najnowsza.values()) {
      suma.cpu += r.cpuUsageMax;
      suma.ramMb += r.memUsageMaxMb;
      suma.diskMb += r.diskUsageMb;
    }
    return suma;
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
    // Charges are stored as NEGATIVE debits in the ledger (see
    // WalletLedgerService.applyEntry → amount.negated()). The cap guard needs
    // the spend as a positive total — without Math.abs the comparison
    // `spent + projectedHourly > cap` would never trigger (audit F-01).
    return Math.abs(Number(sum._sum.amount ?? 0));
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
