import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Post, UseGuards } from '@nestjs/common';
import {
  MaintenanceWindowStatus,
  ProductAnnouncementKind,
  ProductAnnouncementStatus,
  IncidentSeverity,
  IncidentStatus,
  Role,
  StatusWebhookEvent,
} from '@verris/database';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AdminNodeActions, ProductOpsActions } from '../common/audit/audit.actions';
import { CryptoService } from '../common/crypto/crypto.service';
import { StatusWebhookService } from '../status/status-webhook.service';
import { assertPublicWebhookUrl } from '../status/status-webhook.service';
import { StatusService } from '../status/status.service';

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

class CreateStatusWebhookEndpointDto {
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @IsEnum(StatusWebhookEvent, { each: true })
  events!: StatusWebhookEvent[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  secret?: string;
}

class ComposeIncidentDto {
  @IsString()
  probeId!: string;

  @IsEnum(IncidentSeverity)
  severity!: IncidentSeverity;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  publicMessage?: string;
}

@Controller('admin/product-ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ProductOpsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly webhooks: StatusWebhookService,
    private readonly status: StatusService,
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

  @Get('capacity')
  async capacityPlanner() {
    const servers = await this.prisma.server.findMany({
      where: { status: { in: ['ACTIVE', 'MAINTENANCE'] } },
      include: {
        accounts: { select: { cpuLimit: true, ramLimitMb: true, diskLimitMb: true, status: true } },
      },
      orderBy: { name: 'asc' },
    });
    return servers.map((server) => {
      const activeAccounts = server.accounts.filter((a) => a.status !== 'DELETED');
      const cpuCommitted = activeAccounts.reduce((sum, a) => sum + a.cpuLimit, 0);
      const ramCommitted = activeAccounts.reduce((sum, a) => sum + a.ramLimitMb, 0);
      const diskCommitted = activeAccounts.reduce((sum, a) => sum + a.diskLimitMb, 0);
      return {
        id: server.id,
        name: server.name ?? server.hostname,
        hostname: server.hostname,
        status: server.status,
        activeAccounts: activeAccounts.length,
        cpuCommitted,
        ramCommittedMb: ramCommitted,
        latestDiskUsageMb: diskCommitted,
        risk:
          cpuCommitted >= 800 || ramCommitted >= 64 * 1024
            ? 'high'
            : cpuCommitted >= 500 || ramCommitted >= 40 * 1024
              ? 'medium'
              : 'low',
      };
    });
  }

  @Get('anomalies')
  async anomalyBoard() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [openIncidents, failedMigrations, failedProvisioning, usageSpikes] = await Promise.all([
      this.prisma.probeIncident.findMany({
        where: { status: IncidentStatus.OPEN },
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          severity: true,
          title: true,
          publicMessage: true,
          startedAt: true,
          probe: { select: { id: true, kind: true, label: true, target: true, server: { select: { id: true, name: true, hostname: true } } } },
        },
      }),
      this.prisma.migrationRequest.findMany({
        where: { status: 'FAILED', updatedAt: { gte: since } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          subscriptionId: true,
          targetDomain: true,
          currentStep: true,
          updatedAt: true,
          lastError: true,
        },
      }),
      this.prisma.subscription.findMany({
        where: { provisioningStage: 'failed', updatedAt: { gte: since } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          userId: true,
          provisioningStage: true,
          provisioningAttempts: true,
          provisioningLastError: true,
          updatedAt: true,
        },
      }),
      this.prisma.usageMetric.findMany({
        where: { bucketStart: { gte: since }, OR: [{ cpuUsageMax: { gte: 90 } }, { ioUsageKbps: { gte: 50000 } }] },
        orderBy: { bucketStart: 'desc' },
        take: 20,
        select: {
          id: true,
          subscriptionId: true,
          serverId: true,
          bucketStart: true,
          cpuUsageMax: true,
          ioUsageKbps: true,
        },
      }),
    ]);
    return {
      openIncidents,
      failedMigrations: failedMigrations.map((row) => ({
        ...row,
        lastError: row.lastError ? sanitizeOperationalError(row.lastError) : null,
      })),
      failedProvisioning: failedProvisioning.map((row) => ({
        ...row,
        provisioningLastError: row.provisioningLastError
          ? sanitizeOperationalError(row.provisioningLastError)
          : null,
      })),
      usageSpikes,
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
    await this.webhooks.enqueue(StatusWebhookEvent.MAINTENANCE_SCHEDULED, {
      maintenanceWindowId: window.id,
      serverId: window.serverId,
      title: window.title,
      publicMessage: window.publicMessage,
      scheduledStart: window.scheduledStart.toISOString(),
      scheduledEnd: window.scheduledEnd.toISOString(),
    });
    return window;
  }

  @Post('incidents')
  @HttpCode(201)
  async composeIncident(@CurrentUser() user: { userId: string }, @Body() dto: ComposeIncidentDto) {
    const probe = await this.prisma.serviceProbe.findUnique({
      where: { id: dto.probeId },
      include: { server: { select: { id: true, name: true } } },
    });
    if (!probe) {
      throw new NotFoundException('Probe not found');
    }
    const incident = await this.prisma.probeIncident.create({
      data: {
        probeId: probe.id,
        severity: dto.severity,
        status: IncidentStatus.OPEN,
        title: dto.title.trim(),
        publicMessage: dto.publicMessage?.trim() || null,
        detectionMeta: { composedBy: user.userId, serverId: probe.serverId },
      },
    });
    await this.audit.record({
      action: ProductOpsActions.INCIDENT_COMPOSER_PUBLISHED,
      actorUserId: user.userId,
      details: { incidentId: incident.id, probeId: probe.id, serverId: probe.serverId },
    });
    await this.webhooks.enqueue(StatusWebhookEvent.INCIDENT_CREATED, {
      incidentId: incident.id,
      probeId: probe.id,
      serverId: probe.serverId,
      serverName: probe.server.name,
      severity: incident.severity,
      title: incident.title,
      publicMessage: incident.publicMessage,
      startedAt: incident.startedAt.toISOString(),
    });
    this.status.invalidate();
    return incident;
  }

  @Get('status-webhooks')
  listStatusWebhooks() {
    return this.prisma.statusWebhookEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        url: true,
        isActive: true,
        events: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { deliveries: true } },
      },
    });
  }

  @Post('status-webhooks')
  @HttpCode(201)
  async createStatusWebhook(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateStatusWebhookEndpointDto,
  ) {
    try {
      await assertPublicWebhookUrl(dto.url.trim());
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid webhook URL');
    }
    const endpoint = await this.prisma.statusWebhookEndpoint.create({
      data: {
        url: dto.url.trim(),
        events: dto.events,
        secretEnc: dto.secret?.trim() ? this.crypto.encrypt(dto.secret.trim()) : null,
        createdById: user.userId,
      },
    });
    await this.audit.record({
      action: AdminNodeActions.STATUS_WEBHOOK_ENDPOINT_CREATED,
      actorUserId: user.userId,
      details: { statusWebhookEndpointId: endpoint.id, events: endpoint.events },
    });
    return endpoint;
  }

  @Get('status-webhook-deliveries')
  listStatusWebhookDeliveries() {
    return this.prisma.statusWebhookDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        endpoint: { select: { id: true, url: true } },
      },
    });
  }
}

function sanitizeOperationalError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('timeout') || lower.includes('etimedout')) return 'timeout';
  if (lower.includes('capacity')) return 'capacity';
  if (lower.includes('unauthorized') || lower.includes('credentials')) return 'auth_configuration';
  if (lower.includes('already exists')) return 'resource_conflict';
  return 'internal_error';
}
