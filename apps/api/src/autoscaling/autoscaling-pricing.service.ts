import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AutoscalingPriceRule, AutoscalingResource, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreatePriceRuleDto, UpdatePriceRuleDto } from './dto/price-rule.dto';
import {
  AUTOSCALING_CATALOG_RESOURCES,
  AUTOSCALING_UNIT_BY_RESOURCE,
  isCatalogAutoscalingResource,
} from './autoscaling-pricing.constants';
import {
  assertUniqueActiveTierThreshold,
  hourlyCostBreakdownForCatalogAmounts,
  hourlyCostForCatalogAmounts,
} from './autoscaling-pricing.util';

@Injectable()
export class AutoscalingPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Public catalog — used by /pricing landing & customer cost calculator.
  async listPublic(): Promise<AutoscalingPriceRule[]> {
    return this.prisma.autoscalingPriceRule.findMany({
      where: {
        isActive: true,
        resource: { in: AUTOSCALING_CATALOG_RESOURCES },
      },
      orderBy: [{ resource: 'asc' }, { thresholdAbove: 'asc' }],
    });
  }

  async listAll(): Promise<AutoscalingPriceRule[]> {
    return this.prisma.autoscalingPriceRule.findMany({
      orderBy: [{ resource: 'asc' }, { thresholdAbove: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getById(id: string): Promise<AutoscalingPriceRule> {
    const rule = await this.prisma.autoscalingPriceRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Price rule not found');
    return rule;
  }

  async create(dto: CreatePriceRuleDto, actorUserId: string): Promise<AutoscalingPriceRule> {
    if (!isCatalogAutoscalingResource(dto.resource)) {
      throw new BadRequestException(
        'Only CPU, RAM and DISK pricing rules can be created. IO and TRANSFER are retired.',
      );
    }

    const unit = AUTOSCALING_UNIT_BY_RESOURCE[dto.resource];
    if (dto.unit && dto.unit !== unit) {
      throw new BadRequestException(`Unit for ${dto.resource} must be "${unit}"`);
    }

    const isActive = dto.isActive ?? true;
    const thresholdAbove = dto.thresholdAbove ?? 0;
    await this.assertTierUnique({
      resource: dto.resource,
      thresholdAbove,
      isActive,
    });

    const rule = await this.prisma.autoscalingPriceRule.create({
      data: {
        resource: dto.resource,
        unit,
        pricePerUnit: new Prisma.Decimal(dto.pricePerUnit),
        currency: dto.currency ?? 'PLN',
        thresholdAbove,
        isActive,
        validUntil: null,
        notes: dto.notes ?? null,
      },
    });
    await this.audit.record({
      action: 'AUTOSCALING_PRICE_RULE_CREATED',
      actorUserId,
      details: {
        ruleId: rule.id,
        resource: rule.resource,
        unit: rule.unit,
        pricePerUnit: rule.pricePerUnit.toString(),
      },
    });
    return rule;
  }

  async update(
    id: string,
    dto: UpdatePriceRuleDto,
    actorUserId: string,
  ): Promise<AutoscalingPriceRule> {
    const existing = await this.getById(id);
    const data: Prisma.AutoscalingPriceRuleUpdateInput = {};

    if (dto.pricePerUnit !== undefined) {
      data.pricePerUnit = new Prisma.Decimal(dto.pricePerUnit);
    }
    if (dto.thresholdAbove !== undefined) {
      data.thresholdAbove = dto.thresholdAbove;
    }
    if (dto.notes !== undefined) {
      const trimmed =
        typeof dto.notes === 'string' ? dto.notes.trim() : '';
      data.notes = trimmed.length > 0 ? trimmed : null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      data.validUntil = dto.isActive ? null : new Date();
    }

    const nextActive = dto.isActive ?? existing.isActive;
    const nextThreshold = dto.thresholdAbove ?? existing.thresholdAbove;
    if (dto.isActive !== undefined || dto.thresholdAbove !== undefined) {
      await this.assertTierUnique({
        resource: existing.resource,
        thresholdAbove: nextThreshold,
        isActive: nextActive,
        excludeRuleId: id,
      });
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    const updated = await this.prisma.autoscalingPriceRule.update({
      where: { id },
      data,
    });
    await this.audit.record({
      action: 'AUTOSCALING_PRICE_RULE_UPDATED',
      actorUserId,
      details: { ruleId: id, changes: { ...dto } },
    });
    return updated;
  }

  async deactivate(id: string, actorUserId: string): Promise<AutoscalingPriceRule> {
    await this.getById(id);
    const rule = await this.prisma.autoscalingPriceRule.update({
      where: { id },
      data: { isActive: false, validUntil: new Date() },
    });
    await this.audit.record({
      action: 'AUTOSCALING_PRICE_RULE_DEACTIVATED',
      actorUserId,
      details: { ruleId: id },
    });
    return rule;
  }

  /**
   * Lightweight estimator used by the /pricing calculator. Computes the
   * hourly cost of a given delta on top of the plan baseline by walking
   * each resource's active rule (lowest threshold first).
   */
  async estimateHourlyCost(opts: {
    cpuPercent?: number;
    ramGb?: number;
    diskGb?: number;
  }): Promise<{ currency: string; hourly: string; daily: string; monthly: string }> {
    const rules = await this.listPublic();
    const currency = rules[0]?.currency ?? 'PLN';

    const hourly = hourlyCostForCatalogAmounts(rules, {
      cpuPercent: opts.cpuPercent ?? 0,
      ramGb: opts.ramGb ?? 0,
      diskGb: opts.diskGb ?? 0,
    });

    return {
      currency,
      hourly: hourly.toFixed(4),
      daily: (hourly * 24).toFixed(2),
      monthly: (hourly * 24 * 30).toFixed(2),
    };
  }

  async simulateEffectiveRate(opts: {
    cpuPercent?: number;
    ramGb?: number;
    diskGb?: number;
    draftResource?: AutoscalingResource;
    draftPricePerUnit?: number;
    draftThresholdAbove?: number;
  }) {
    let rules = await this.listPublic();
    if (
      opts.draftResource &&
      opts.draftPricePerUnit !== undefined &&
      opts.draftThresholdAbove !== undefined &&
      isCatalogAutoscalingResource(opts.draftResource)
    ) {
      const unit = AUTOSCALING_UNIT_BY_RESOURCE[opts.draftResource];
      rules = [
        ...rules.filter((r) => r.resource !== opts.draftResource),
        {
          id: 'draft',
          resource: opts.draftResource,
          unit,
          pricePerUnit: new Prisma.Decimal(opts.draftPricePerUnit),
          currency: 'PLN',
          thresholdAbove: opts.draftThresholdAbove,
          isActive: true,
          validFrom: new Date(),
          validUntil: null,
          notes: 'draft',
          createdAt: new Date(),
        },
      ];
    }

    const amounts = {
      cpuPercent: opts.cpuPercent ?? 0,
      ramGb: opts.ramGb ?? 0,
      diskGb: opts.diskGb ?? 0,
    };
    const breakdown = hourlyCostBreakdownForCatalogAmounts(rules, amounts);
    const currency = rules[0]?.currency ?? 'PLN';

    return {
      currency,
      amounts,
      breakdown: {
        cpuHourly: breakdown.cpu.toFixed(6),
        ramHourly: breakdown.ram.toFixed(6),
        diskHourly: breakdown.disk.toFixed(6),
        totalHourly: breakdown.total.toFixed(6),
      },
      daily: (breakdown.total * 24).toFixed(2),
      monthly: (breakdown.total * 24 * 30).toFixed(2),
    };
  }

  async revenueReportLast30Days() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const txs = await this.prisma.walletTransaction.findMany({
      where: {
        type: 'CHARGE_AUTOSCALING',
        status: 'COMPLETED',
        createdAt: { gte: since },
      },
      select: { amount: true, metadata: true },
    });

    const totals = { cpu: new Prisma.Decimal(0), ram: new Prisma.Decimal(0), disk: new Prisma.Decimal(0), other: new Prisma.Decimal(0) };
    let grand = new Prisma.Decimal(0);

    for (const tx of txs) {
      const abs = tx.amount.abs();
      grand = grand.plus(abs);
      const meta = tx.metadata as {
        revenueCpuPln?: string | number;
        revenueRamPln?: string | number;
        revenueDiskPln?: string | number;
      } | null;
      if (meta?.revenueCpuPln != null) {
        totals.cpu = totals.cpu.plus(new Prisma.Decimal(meta.revenueCpuPln));
        totals.ram = totals.ram.plus(new Prisma.Decimal(meta.revenueRamPln ?? 0));
        totals.disk = totals.disk.plus(new Prisma.Decimal(meta.revenueDiskPln ?? 0));
      } else {
        totals.other = totals.other.plus(abs);
      }
    }

    const scaleEvents = await this.prisma.autoscalingEvent.groupBy({
      by: ['resource', 'direction'],
      where: { createdAt: { gte: since }, resource: { not: null } },
      _count: { _all: true },
    });

    return {
      periodDays: 30,
      currency: 'PLN',
      chargeCount: txs.length,
      totalRevenue: grand.toFixed(2),
      byResource: {
        cpu: totals.cpu.toFixed(2),
        ram: totals.ram.toFixed(2),
        disk: totals.disk.toFixed(2),
        unallocatedLegacy: totals.other.toFixed(2),
      },
      scaleEvents: scaleEvents.map((row) => ({
        resource: row.resource,
        direction: row.direction,
        count: row._count._all,
      })),
    };
  }

  private async assertTierUnique(opts: {
    resource: AutoscalingResource;
    thresholdAbove: number;
    isActive: boolean;
    excludeRuleId?: string;
  }) {
    const existing = await this.prisma.autoscalingPriceRule.findMany({
      where: { resource: opts.resource },
      select: { id: true, resource: true, thresholdAbove: true, isActive: true },
    });
    try {
      assertUniqueActiveTierThreshold(existing, opts);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
