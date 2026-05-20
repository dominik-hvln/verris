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
import { hourlyCostForCatalogAmounts } from './autoscaling-pricing.util';

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

    const rule = await this.prisma.autoscalingPriceRule.create({
      data: {
        resource: dto.resource,
        unit,
        pricePerUnit: new Prisma.Decimal(dto.pricePerUnit),
        currency: dto.currency ?? 'PLN',
        thresholdAbove: dto.thresholdAbove ?? 0,
        isActive: dto.isActive ?? true,
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
}
