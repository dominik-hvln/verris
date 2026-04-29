import { Injectable, NotFoundException } from '@nestjs/common';
import { AutoscalingPriceRule, AutoscalingResource } from '@ekohost/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreatePriceRuleDto, UpdatePriceRuleDto } from './dto/price-rule.dto';

@Injectable()
export class AutoscalingPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Public catalog — used by /pricing landing & customer cost calculator.
  async listPublic(): Promise<AutoscalingPriceRule[]> {
    return this.prisma.autoscalingPriceRule.findMany({
      where: { isActive: true },
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
    const rule = await this.prisma.autoscalingPriceRule.create({
      data: {
        resource: dto.resource,
        unit: dto.unit,
        pricePerUnit: dto.pricePerUnit,
        currency: dto.currency ?? 'PLN',
        thresholdAbove: dto.thresholdAbove ?? 0,
        isActive: dto.isActive ?? true,
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
    await this.getById(id);
    const updated = await this.prisma.autoscalingPriceRule.update({
      where: { id },
      data: {
        ...dto,
      },
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
    ramMb?: number;
    ioKbps?: number;
    transferGb?: number;
  }): Promise<{ currency: string; hourly: string; daily: string; monthly: string }> {
    const rules = await this.listPublic();
    const byResource = new Map<AutoscalingResource, AutoscalingPriceRule[]>();
    for (const rule of rules) {
      const list = byResource.get(rule.resource) ?? [];
      list.push(rule);
      byResource.set(rule.resource, list);
    }

    const currency = rules[0]?.currency ?? 'PLN';

    const accrue = (resource: AutoscalingResource, units: number): number => {
      const list = byResource.get(resource);
      if (!list || list.length === 0 || units <= 0) return 0;
      // Apply the cheapest applicable rule (the one with the highest
      // thresholdAbove ≤ units). Fall back to the first if none match.
      const sorted = list.slice().sort((a, b) => b.thresholdAbove - a.thresholdAbove);
      const rule = sorted.find((r) => units >= r.thresholdAbove) ?? sorted[sorted.length - 1];
      return units * Number(rule.pricePerUnit);
    };

    const hourly =
      accrue(AutoscalingResource.CPU, opts.cpuPercent ?? 0) +
      accrue(AutoscalingResource.RAM, opts.ramMb ?? 0) +
      accrue(AutoscalingResource.IO, opts.ioKbps ?? 0);
    // Transfer is per-GB (not per-hour) so we don't multiply.
    const transferCost = accrue(AutoscalingResource.TRANSFER, opts.transferGb ?? 0);

    return {
      currency,
      hourly: hourly.toFixed(4),
      daily: (hourly * 24 + transferCost).toFixed(2),
      monthly: (hourly * 24 * 30 + transferCost).toFixed(2),
    };
  }
}
