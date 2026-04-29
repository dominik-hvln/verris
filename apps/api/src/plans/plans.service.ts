import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Plan } from '@ekohost/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
    return this.prisma.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async getById(id: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(dto: CreatePlanDto, actorUserId: string): Promise<Plan> {
    this.validateCloudLinuxLimits(dto.entryProcesses, dto.nprocLimit);
    const existing = await this.prisma.plan.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Plan with slug "${dto.slug}" already exists`);

    const plan = await this.prisma.plan.create({
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
        currency: dto.currency ?? 'PLN',
        isPublic: dto.isPublic ?? true,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        stripePriceMonthlyId: dto.stripePriceMonthlyId ?? null,
        stripePriceYearlyId: dto.stripePriceYearlyId ?? null,
      },
    });

    await this.audit.record({
      action: 'PLAN_CREATED',
      actorUserId,
      details: { planId: plan.id, slug: plan.slug },
    });
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, actorUserId: string): Promise<Plan> {
    const current = await this.getById(id);
    this.validateCloudLinuxLimits(
      dto.entryProcesses ?? current.entryProcesses,
      dto.nprocLimit ?? current.nprocLimit,
    );
    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        ...dto,
      },
    });
    await this.audit.record({
      action: 'PLAN_UPDATED',
      actorUserId,
      details: { planId: id, changes: { ...dto } },
    });
    return updated;
  }

  async deactivate(id: string, actorUserId: string): Promise<Plan> {
    await this.getById(id);
    const plan = await this.prisma.plan.update({
      where: { id },
      data: { isActive: false, isPublic: false },
    });
    await this.audit.record({
      action: 'PLAN_DEACTIVATED',
      actorUserId,
      details: { planId: id },
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
}
