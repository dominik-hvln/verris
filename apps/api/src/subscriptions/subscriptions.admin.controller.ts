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
import { HostingRestoreService } from './hosting-restore.service';
import { DiagnosticsService } from './diagnostics.service';
import { HostingRestoreDto } from './dto/hosting-restore.dto';
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
    private readonly hostingRestore: HostingRestoreService,
    private readonly diagnostics: DiagnosticsService,
  ) {}

  /** ADM-2 — Centrum diagnostyki: jedno wywołanie składa pełen obraz usługi. */
  @Get(':id/diagnostics')
  @Roles(Role.ADMIN, Role.STAFF)
  runDiagnostics(@Param('id') id: string) {
    return this.diagnostics.forSubscription(id);
  }

  /** Admin-initiated restore (no domain confirmation required; full audit trail). */
  @Post(':id/hosting-restore')
  @Roles(Role.ADMIN, Role.STAFF)
  runHostingRestore(
    @Param('id') id: string,
    @Body() dto: HostingRestoreDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.hostingRestore.enqueue(id, actor.userId, {
      backupId: dto.backupId,
      scopeFiles: dto.scopeFiles,
      scopeDatabases: dto.scopeDatabases,
      scopeEmail: dto.scopeEmail,
      safetyBackup: dto.safetyBackup,
      isAdmin: true,
    });
  }

  @Get(':id/hosting-restore/status')
  @Roles(Role.ADMIN, Role.STAFF)
  hostingRestoreStatus(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.hostingRestore.latestForSubscription(id, actor.userId, true);
  }

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

  /** Per-service resource usage drill-down for ops (CPU/RAM/disk/IO buckets + effective LVE limits). */
  @Get(':id/usage')
  @Roles(Role.ADMIN, Role.STAFF)
  async usage(@Param('id') id: string, @Query('window') window = '24h') {
    const hours = window === '7d' ? 24 * 7 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [rowsDesc, account] = await Promise.all([
      this.prisma.usageMetric.findMany({
        where: { subscriptionId: id, bucketStart: { gte: since } },
        orderBy: { bucketStart: 'desc' },
        take: window === '7d' ? 500 : 1440,
      }),
      this.prisma.account.findUnique({
        where: { subscriptionId: id },
        select: {
          daUsername: true,
          domain: true,
          status: true,
          serverId: true,
          cpuLimit: true,
          ramLimitMb: true,
          diskLimitMb: true,
          ioLimitKbps: true,
          iopsLimit: true,
          entryProcesses: true,
          nprocLimit: true,
          scaledCpu: true,
          scaledRamMb: true,
          scaledDiskMb: true,
        },
      }),
    ]);
    const rows = rowsDesc.reverse();
    const latest = rows.at(-1) ?? null;
    return {
      window,
      account,
      latest: latest
        ? {
            bucketStart: latest.bucketStart.toISOString(),
            cpuUsageAvg: latest.cpuUsageAvg,
            cpuUsageMax: latest.cpuUsageMax,
            memUsageAvgMb: latest.memUsageAvgMb,
            memUsageMaxMb: latest.memUsageMaxMb,
            diskUsageMb: latest.diskUsageMb,
            ioUsageKbps: latest.ioUsageKbps,
          }
        : null,
      rows: rows.map((row) => ({
        bucketStart: row.bucketStart.toISOString(),
        bucketDurationS: row.bucketDurationS,
        cpuUsageAvg: row.cpuUsageAvg,
        cpuUsageMax: row.cpuUsageMax,
        memUsageAvgMb: row.memUsageAvgMb,
        memUsageMaxMb: row.memUsageMaxMb,
        diskUsageMb: row.diskUsageMb,
        ioUsageKbps: row.ioUsageKbps,
      })),
    };
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
    return this.planChange.previewForAdmin(id, dto.targetPlanId, dto.targetInterval);
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
      dto.targetInterval,
    );
  }
}
