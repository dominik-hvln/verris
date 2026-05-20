import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role, SubscriptionStatus } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  SubscriptionsService,
  SuspendReason,
} from './subscriptions.service';
import { MigrationOrchestratorService } from './migration-orchestrator.service';
import { PlanChangeService } from './plan-change.service';
import {
  SuspendSubscriptionDto,
  UnsuspendSubscriptionDto,
} from './dto/subscription.dto';
import { RequestInternalMigrationDto } from './dto/migration.dto';
import {
  AdminChangePlanDto,
  AdminPreviewPlanChangeDto,
} from './dto/admin-plan-change.dto';

const ALLOWED_REASONS: SuspendReason[] = [
  'PAYMENT_FAILED',
  'GRACE_EXPIRED',
  'ABUSE',
  'MANUAL_ADMIN',
  'CUSTOMER_REQUEST',
];

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SubscriptionsAdminController {
  constructor(
    private readonly subs: SubscriptionsService,
    private readonly prisma: PrismaService,
    private readonly migrations: MigrationOrchestratorService,
    private readonly planChange: PlanChangeService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  list(@Query('status') status?: string, @Query('userId') userId?: string) {
    const where: Record<string, unknown> = {};
    if (status) {
      if (!Object.values(SubscriptionStatus).includes(status as SubscriptionStatus)) {
        throw new BadRequestException(`Invalid status filter: ${status}`);
      }
      where.status = status;
    }
    if (userId) where.userId = userId;
    return this.prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { slug: true, name: true } },
        user: { select: { email: true, firstName: true, lastName: true } },
        account: {
          select: { id: true, daUsername: true, domain: true, status: true, serverId: true },
        },
      },
      take: 200,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  detail(@Param('id') id: string) {
    return this.prisma.subscription.findUniqueOrThrow({
      where: { id },
      include: {
        plan: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        account: { include: { server: { select: { id: true, name: true, region: true, hostname: true } } } },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendSubscriptionDto,
    @CurrentUser() actor: { userId: string },
  ) {
    const reason = ALLOWED_REASONS.includes(dto.reason as SuspendReason)
      ? (dto.reason as SuspendReason)
      : 'MANUAL_ADMIN';
    return this.subs.suspend({
      subscriptionId: id,
      reason,
      note: dto.note,
      actorUserId: actor.userId,
    });
  }

  @Post(':id/unsuspend')
  @HttpCode(200)
  unsuspend(
    @Param('id') id: string,
    @Body() dto: UnsuspendSubscriptionDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.subs.unsuspend({
      subscriptionId: id,
      note: dto.note,
      chargeRenewal: dto.chargeRenewal,
      actorUserId: actor.userId,
    });
  }

  /** G‑7: zlecenie migracji wewnętrznej między węzłami przez admin/staff. */
  @Post(':id/internal-migration')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  requestInternalMigration(
    @Param('id') id: string,
    @Body() dto: RequestInternalMigrationDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.migrations.requestInternalMigrationByAdmin(id, actor.userId, dto);
  }

  @Get(':id/migrations')
  @Roles(Role.ADMIN, Role.STAFF)
  migrationTimeline(@Param('id') id: string) {
    return this.migrations.listMigrationTimelineForAdmin(id);
  }

  @Get(':id/plan/eligible-plans')
  @Roles(Role.ADMIN, Role.STAFF)
  listEligiblePlans(@Param('id') id: string) {
    return this.planChange.listEligiblePlansForAdmin(id);
  }

  @Post(':id/plan/preview')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  previewPlanChange(@Param('id') id: string, @Body() dto: AdminPreviewPlanChangeDto) {
    return this.planChange.previewForAdmin(id, dto.targetPlanId);
  }

  @Post(':id/plan')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  async changePlan(
    @Param('id') id: string,
    @Body() dto: AdminChangePlanDto,
    @CurrentUser() actor: { userId: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { role: true },
    });
    if (!user) throw new BadRequestException('Actor not found');
    return this.planChange.changeForAdmin(
      actor.userId,
      user.role,
      id,
      dto.targetPlanId,
      dto.reason,
      dto.skipBilling ?? false,
    );
  }
}
