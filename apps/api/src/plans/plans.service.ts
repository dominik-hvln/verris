import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Plan } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { StripeService } from '../billing/stripe/stripe.service';
import { PlanStripeSyncService } from './plan-stripe-sync.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

interface PriceValidationContext {
  /** Walidujemy z planem ile-w-PLN i jakim intervalem powinien się zgadzać. */
  expectedAmountPln: number;
  expectedCurrency: string;
  expectedInterval: 'month' | 'year';
}

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stripe: StripeService,
    private readonly planStripeSync: PlanStripeSyncService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public catalog
  // ---------------------------------------------------------------------------

  async listPublic(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
    });
  }

  async getBySlug(slug: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { slug } });
    if (!plan || !plan.isActive) throw new NotFoundException('Plan not found');
    return plan;
  }

  // ---------------------------------------------------------------------------
  // Admin CRUD
  // ---------------------------------------------------------------------------

  async listAll(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { subscriptions: true } } } as never,
    } as never);
  }

  async getById(id: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(dto: CreatePlanDto, actorUserId: string): Promise<Plan> {
    this.validateCloudLinuxLimits(dto.entryProcesses, dto.nprocLimit);
    this.validatePricingConsistency(dto.priceMonthly, dto.priceYearly);

    const existing = await this.prisma.plan.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Plan with slug "${dto.slug}" already exists`);

    const currency = (dto.currency ?? 'PLN').toUpperCase();

    if (dto.stripePriceMonthlyId) {
      await this.validateStripePrice(dto.stripePriceMonthlyId, {
        expectedAmountPln: dto.priceMonthly,
        expectedCurrency: currency,
        expectedInterval: 'month',
      });
    }
    if (dto.stripePriceYearlyId) {
      await this.validateStripePrice(dto.stripePriceYearlyId, {
        expectedAmountPln: dto.priceYearly,
        expectedCurrency: currency,
        expectedInterval: 'year',
      });
    }

    const manualStripe = this.hasManualStripePriceIds(dto);

    let plan = await this.prisma.plan.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        cpuLimit: dto.cpuLimit,
        ramLimitMb: dto.ramLimitMb,
        diskLimitMb: dto.diskLimitMb,
        ioLimitKbps: dto.ioLimitKbps ?? 10240,
        iopsLimit: dto.iopsLimit ?? 1024,
        entryProcesses: dto.entryProcesses ?? 40,
        nprocLimit: dto.nprocLimit ?? 20,
        includedTransferGb: dto.includedTransferGb,
        priceMonthly: dto.priceMonthly,
        priceYearly: dto.priceYearly,
        currency,
        isPublic: dto.isPublic ?? true,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        stripePriceMonthlyId: manualStripe ? (dto.stripePriceMonthlyId?.trim() ?? null) : null,
        stripePriceYearlyId: manualStripe ? (dto.stripePriceYearlyId?.trim() ?? null) : null,
        autoscalingMaxOverscaleCpu: dto.autoscalingMaxOverscaleCpu ?? 3,
        autoscalingMaxOverscaleRam: dto.autoscalingMaxOverscaleRam ?? 3,
        autoscalingMaxOverscaleDisk: dto.autoscalingMaxOverscaleDisk ?? 3,
      },
    });

    if (!manualStripe) {
      plan = await this.applyStripeAutoSync(plan, actorUserId, 'create');
    }

    await this.audit.record({
      action: 'PLAN_CREATED',
      actorUserId,
      details: {
        planId: plan.id,
        slug: plan.slug,
        priceMonthly: plan.priceMonthly.toString(),
        priceYearly: plan.priceYearly.toString(),
        stripeProductId: plan.stripeProductId,
        stripePriceMonthlyId: plan.stripePriceMonthlyId,
        stripePriceYearlyId: plan.stripePriceYearlyId,
        stripeSyncMode: manualStripe ? 'manual' : 'auto',
      },
    });
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, actorUserId: string): Promise<Plan> {
    const current = await this.getById(id);

    this.validateCloudLinuxLimits(
      dto.entryProcesses ?? current.entryProcesses,
      dto.nprocLimit ?? current.nprocLimit,
    );
    const nextMonthly = dto.priceMonthly ?? Number(current.priceMonthly);
    const nextYearly = dto.priceYearly ?? Number(current.priceYearly);
    this.validatePricingConsistency(nextMonthly, nextYearly);

    const nextCurrency = (current.currency ?? 'PLN').toUpperCase();

    if (dto.stripePriceMonthlyId !== undefined && dto.stripePriceMonthlyId !== null && dto.stripePriceMonthlyId !== '') {
      await this.validateStripePrice(dto.stripePriceMonthlyId, {
        expectedAmountPln: nextMonthly,
        expectedCurrency: nextCurrency,
        expectedInterval: 'month',
      });
    }
    if (dto.stripePriceYearlyId !== undefined && dto.stripePriceYearlyId !== null && dto.stripePriceYearlyId !== '') {
      await this.validateStripePrice(dto.stripePriceYearlyId, {
        expectedAmountPln: nextYearly,
        expectedCurrency: nextCurrency,
        expectedInterval: 'year',
      });
    }

    const data: Record<string, unknown> = { ...dto };
    if (dto.stripePriceMonthlyId === '') data.stripePriceMonthlyId = null;
    if (dto.stripePriceYearlyId === '') data.stripePriceYearlyId = null;

    let updated = await this.prisma.plan.update({
      where: { id },
      data: data as never,
    });

    const manualStripe = this.hasManualStripePriceIds(dto);
    if (!manualStripe) {
      updated = await this.applyStripeAutoSync(updated, actorUserId, 'update');
    }

    await this.audit.record({
      action: 'PLAN_UPDATED',
      actorUserId,
      details: {
        planId: id,
        changes: this.summarizeChanges(current, dto) as never,
        stripeSyncMode: manualStripe ? 'manual' : 'auto',
      },
    });
    return updated;
  }

  async syncStripeCatalog(id: string, actorUserId: string): Promise<Plan> {
    const plan = await this.getById(id);
    const updated = await this.applyStripeAutoSync(plan, actorUserId, 'manual_sync');
    await this.audit.record({
      action: 'PLAN_STRIPE_SYNCED',
      actorUserId,
      details: {
        planId: id,
        slug: updated.slug,
        stripeProductId: updated.stripeProductId,
        stripePriceMonthlyId: updated.stripePriceMonthlyId,
        stripePriceYearlyId: updated.stripePriceYearlyId,
      },
    });
    return updated;
  }

  async deactivate(id: string, actorUserId: string): Promise<Plan> {
    const current = await this.getById(id);
    const subsCount = await this.prisma.subscription.count({
      where: {
        planId: id,
        status: { in: ['ACTIVE', 'PROVISIONING', 'PENDING_PAYMENT', 'PAST_DUE'] },
      },
    });
    const plan = await this.prisma.plan.update({
      where: { id },
      data: { isActive: false, isPublic: false },
    });
    await this.audit.record({
      action: 'PLAN_DEACTIVATED',
      actorUserId,
      details: {
        planId: id,
        slug: current.slug,
        activeSubscriptionsAtDeactivation: subsCount,
      },
    });
    return plan;
  }

  /** CloudLinux recommendation: NPROC should be > EP + 15. */
  private validateCloudLinuxLimits(entryProcesses?: number, nprocLimit?: number) {
    if (entryProcesses == null || nprocLimit == null) return;
    if (nprocLimit <= entryProcesses + 15) {
      throw new ConflictException(
        `Invalid CloudLinux limits: NPROC(${nprocLimit}) must be > EP(${entryProcesses}) + 15.`,
      );
    }
  }

  /** Roczna cena nie powinna być niższa niż 6× miesięcznej (sanity guard). */
  private validatePricingConsistency(priceMonthly: number, priceYearly: number) {
    if (priceMonthly <= 0 || priceYearly <= 0) {
      throw new BadRequestException('Ceny muszą być dodatnie.');
    }
    if (priceYearly < priceMonthly * 6) {
      throw new BadRequestException(
        `Cena roczna (${priceYearly}) wygląda nierealistycznie nisko vs miesięczna (${priceMonthly}). Minimum 6× ceny miesięcznej.`,
      );
    }
  }

  /**
   * Sprint 4 / R-05 — twarda walidacja Stripe Price ID przy ustawianiu na
   * planie. Zapobiega literówkom w price_id, niewłaściwej walucie, niewłaściwym
   * intervalom i nieaktywnym cenom — adminowi mówimy konkretnie co nie gra.
   */
  private async validateStripePrice(
    priceId: string,
    ctx: PriceValidationContext,
  ): Promise<void> {
    const stripe = await this.stripe.retrievePriceOrThrow(priceId);
    if (!stripe.active) {
      throw new BadRequestException(
        `Stripe Price "${priceId}" jest wyłączony (active=false). Aktywuj w Stripe Dashboard albo wskaż inny.`,
      );
    }
    if (stripe.type !== 'recurring' || !stripe.recurring) {
      throw new BadRequestException(
        `Stripe Price "${priceId}" nie jest recurring — zaczepiamy go jako subskrypcję.`,
      );
    }
    if (stripe.recurring.interval !== ctx.expectedInterval || stripe.recurring.interval_count !== 1) {
      throw new BadRequestException(
        `Stripe Price "${priceId}" ma interval ${stripe.recurring.interval}×${stripe.recurring.interval_count}, oczekiwane ${ctx.expectedInterval}×1.`,
      );
    }
    if (stripe.recurring.usage_type !== 'licensed') {
      throw new BadRequestException(
        `Stripe Price "${priceId}" jest typu metered — w naszej integracji używamy tylko licensed.`,
      );
    }
    const expectedCurrency = ctx.expectedCurrency.toLowerCase();
    if (stripe.currency.toLowerCase() !== expectedCurrency) {
      throw new BadRequestException(
        `Stripe Price "${priceId}" ma walutę ${stripe.currency.toUpperCase()}, plan jest w ${ctx.expectedCurrency.toUpperCase()}.`,
      );
    }
    const expectedMinor = Math.round(ctx.expectedAmountPln * 100);
    if (stripe.unit_amount === null) {
      throw new BadRequestException(
        `Stripe Price "${priceId}" nie ma kwoty (unit_amount=null) — niewspierane.`,
      );
    }
    if (stripe.unit_amount !== expectedMinor) {
      throw new BadRequestException(
        `Stripe Price "${priceId}" ma kwotę ${(stripe.unit_amount / 100).toFixed(2)} ${stripe.currency.toUpperCase()}, plan ${ctx.expectedAmountPln.toFixed(2)} ${ctx.expectedCurrency.toUpperCase()}.`,
      );
    }
    this.logger.log(
      `Stripe Price ${priceId} validated against plan: ${ctx.expectedInterval} ${ctx.expectedAmountPln} ${ctx.expectedCurrency}`,
    );
  }

  private hasManualStripePriceIds(dto: {
    stripePriceMonthlyId?: string;
    stripePriceYearlyId?: string;
  }): boolean {
    return Boolean(dto.stripePriceMonthlyId?.trim() || dto.stripePriceYearlyId?.trim());
  }

  private async applyStripeAutoSync(
    plan: Plan,
    _actorUserId: string,
    trigger: 'create' | 'update' | 'manual_sync',
  ): Promise<Plan> {
    if (!this.stripe.isConfigured()) {
      this.logger.warn(
        `Plan ${plan.slug}: pominięto auto-sync Stripe (${trigger}) — brak STRIPE_SECRET_KEY`,
      );
      return plan;
    }
    const refs = await this.planStripeSync.syncPlan(plan);
    return this.prisma.plan.update({
      where: { id: plan.id },
      data: refs,
    });
  }

  private summarizeChanges(prev: Plan, dto: UpdatePlanDto): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      const prevValue = (prev as unknown as Record<string, unknown>)[key];
      const prevString = prevValue === null || prevValue === undefined ? null : String(prevValue);
      const nextString = value === null ? null : String(value);
      if (prevString !== nextString) {
        out[key] = { from: prevString, to: nextString };
      }
    }
    return out;
  }
}
