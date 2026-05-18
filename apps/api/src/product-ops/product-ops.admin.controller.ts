import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  MaintenanceWindowStatus,
  ProductAnnouncementKind,
  ProductAnnouncementStatus,
  Role,
} from '@verris/database';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AdminNodeActions, ProductOpsActions } from '../common/audit/audit.actions';

class CreateFeatureFlagDto {
  @IsString()
  @MaxLength(80)
  key!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsBoolean()
  enabledDefault!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent!: number;
}

class CreateAnnouncementDto {
  @IsEnum(ProductAnnouncementKind)
  kind!: ProductAnnouncementKind;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(12000)
  bodyMarkdown!: string;

  @IsOptional()
  @IsEnum(Role)
  audienceRole?: Role;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

class CreateMaintenanceWindowDto {
  @IsOptional()
  @IsString()
  serverId?: string;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  publicMessage?: string;

  @IsDateString()
  scheduledStart!: string;

  @IsDateString()
  scheduledEnd!: string;
}

@Controller('admin/product-ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ProductOpsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('preflight')
  async preflight() {
    const [failedProvisioning, failedMigrations, openIncidents, activeServers, activeFlags, scheduledMaintenance] =
      await Promise.all([
        this.prisma.subscription.count({ where: { provisioningStage: 'failed' } }),
        this.prisma.migrationRequest.count({ where: { status: 'FAILED' } }),
        this.prisma.probeIncident.count({ where: { status: 'OPEN' } }),
        this.prisma.server.count({ where: { status: 'ACTIVE' } }),
        this.prisma.featureFlag.count({ where: { enabledDefault: true } }),
        this.prisma.maintenanceWindow.count({
          where: { status: { in: [MaintenanceWindowStatus.SCHEDULED, MaintenanceWindowStatus.IN_PROGRESS] } },
        }),
      ]);
    const blockers = [
      failedProvisioning > 0 ? `${failedProvisioning} failed provisioning` : null,
      failedMigrations > 0 ? `${failedMigrations} failed migrations` : null,
      openIncidents > 0 ? `${openIncidents} open incidents` : null,
      activeServers === 0 ? 'no active compute node' : null,
    ].filter(Boolean);
    return {
      goLiveReady: blockers.length === 0,
      blockers,
      metrics: {
        failedProvisioning,
        failedMigrations,
        openIncidents,
        activeServers,
        activeFlags,
        scheduledMaintenance,
      },
    };
  }

  @Get('feature-flags')
  listFeatureFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Post('feature-flags')
  @HttpCode(201)
  async createFeatureFlag(@CurrentUser() user: { userId: string }, @Body() dto: CreateFeatureFlagDto) {
    const flag = await this.prisma.featureFlag.create({
      data: {
        key: dto.key.trim(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        enabledDefault: dto.enabledDefault,
        rolloutPercent: dto.rolloutPercent,
        createdById: user.userId,
      },
    });
    await this.audit.record({
      action: ProductOpsActions.FEATURE_FLAG_CREATED,
      actorUserId: user.userId,
      details: { key: flag.key, enabled: flag.enabledDefault, rolloutPercent: flag.rolloutPercent },
    });
    return flag;
  }

  @Get('announcements')
  listAnnouncements() {
    return this.prisma.productAnnouncement.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Post('announcements')
  @HttpCode(201)
  async createAnnouncement(@CurrentUser() user: { userId: string }, @Body() dto: CreateAnnouncementDto) {
    const status = dto.publishedAt ? ProductAnnouncementStatus.PUBLISHED : ProductAnnouncementStatus.DRAFT;
    const announcement = await this.prisma.productAnnouncement.create({
      data: {
        kind: dto.kind,
        title: dto.title.trim(),
        bodyMarkdown: dto.bodyMarkdown,
        audienceRole: dto.audienceRole ?? null,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
        status,
        createdById: user.userId,
      },
    });
    await this.audit.record({
      action:
        status === ProductAnnouncementStatus.PUBLISHED
          ? ProductOpsActions.PRODUCT_ANNOUNCEMENT_PUBLISHED
          : ProductOpsActions.PRODUCT_ANNOUNCEMENT_CREATED,
      actorUserId: user.userId,
      details: { announcementId: announcement.id, kind: announcement.kind, status },
    });
    return announcement;
  }

  @Get('maintenance-windows')
  listMaintenanceWindows() {
    return this.prisma.maintenanceWindow.findMany({
      orderBy: { scheduledStart: 'desc' },
      take: 200,
      include: { server: { select: { id: true, name: true, hostname: true } } },
    });
  }

  @Post('maintenance-windows')
  @HttpCode(201)
  async createMaintenanceWindow(@CurrentUser() user: { userId: string }, @Body() dto: CreateMaintenanceWindowDto) {
    const window = await this.prisma.maintenanceWindow.create({
      data: {
        serverId: dto.serverId || null,
        title: dto.title.trim(),
        publicMessage: dto.publicMessage?.trim() || null,
        scheduledStart: new Date(dto.scheduledStart),
        scheduledEnd: new Date(dto.scheduledEnd),
        createdById: user.userId,
      },
    });
    await this.audit.record({
      action: AdminNodeActions.MAINTENANCE_WINDOW_CREATED,
      actorUserId: user.userId,
      details: { maintenanceWindowId: window.id, serverId: window.serverId, title: window.title },
    });
    return window;
  }
}
