import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ServersService } from './servers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, NodeTaskStatus } from '@verris/database';
import { InitServerDto } from './dto/init-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdateDirectAdminConfigDto } from './dto/directadmin-config.dto';
import { UpdateNameserversDto } from './dto/nameservers.dto';
import { QueueHostingProfileTaskDto } from './dto/queue-hosting-profile.dto';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { NodeTasksService } from './node-tasks.service';
import { NodeAuditService } from './node-audit.service';
import { NodeStackReadinessService } from './node-stack-readiness.service';
import { NodeDnsService } from './node-dns.service';
import { renderNodeTasksAgentInstallScript } from './node-tasks-agent.install';
import { IsIP } from 'class-validator';

class MaintenanceModeDto {
  @IsBoolean()
  enable!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ProvisionNsDto {
  /** Optional IPv6 to record for the node (enables AAAA glue + zone). */
  @IsOptional()
  @IsIP(6)
  ipv6?: string;
}

class NodeRepairDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  confirm?: string;
}

class QueueDbUpgradeDto {
  // VER-UPG — docelowa wersja MariaDB. Twarda walidacja wartości jest w serwisie
  // (ALLOWED_DB_VERSIONS), tu pilnujemy tylko kształtu „X.Y”.
  @IsString()
  @MaxLength(8)
  version!: string;
}

@Controller('admin/servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServersAdminController {
  constructor(
    private readonly servers: ServersService,
    private readonly nodeTasks: NodeTasksService,
    private readonly nodeAudit: NodeAuditService,
    private readonly nodeStack: NodeStackReadinessService,
    private readonly nodeDns: NodeDnsService,
  ) {}

  @Get()
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_VIEW')
  list() {
    return this.servers.listServers();
  }

  // #13 — operacje węzłów (NodeTask): lista + ręczne ponowienie nieudanych
  @Get('node-tasks')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_VIEW')
  listNodeTasks(
    @Query('status') status?: string,
    @Query('serverId') serverId?: string,
  ) {
    const allowed = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'];
    return this.nodeTasks.listRecentTasks({
      status: status && allowed.includes(status) ? (status as NodeTaskStatus) : undefined,
      serverId: serverId || undefined,
    });
  }

  @Post('node-tasks/:id/retry')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_MANAGE')
  retryNodeTask(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.nodeTasks.retryFailedTask(id, actor.userId);
  }

  @Post()
  init(
    @Body() dto: InitServerDto,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    return this.servers.initServer(dto, user.userId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':id')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_VIEW')
  get(@Param('id') id: string) {
    return this.servers.getServer(id);
  }

  /** Per-node drill-down: hosting accounts placed on this node + latest telemetry. */
  @Get(':id/accounts')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_VIEW')
  nodeAccounts(@Param('id') id: string) {
    return this.servers.getNodeAccounts(id);
  }

  /** Per-node aggregate usage (summed LVE buckets) + capacity/allocation. */
  @Get(':id/usage')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_VIEW')
  nodeUsage(@Param('id') id: string, @Query('window') window = '24h') {
    return this.servers.getNodeUsage(id, window === '7d' ? '7d' : '24h');
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServerDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.servers.updateServer(id, dto, user.userId);
  }

  @Post(':id/bootstrap-script')
  generateScript(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.servers.generateBootstrapScript(id, user.userId);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    return this.servers.approveServer(id, user.userId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /** Per-node authoritative nameservers (override / inherit platform default). */
  @Get(':id/nameservers')
  getNameservers(@Param('id') id: string) {
    return this.servers.getNodeNameservers(id);
  }

  @Patch(':id/nameservers')
  setNameservers(
    @Param('id') id: string,
    @Body() dto: UpdateNameserversDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.servers.setNodeNameservers(id, dto, user.userId);
  }

  /** Whether the OVH automation is configured (drives the admin button state). */
  @Get('dns/status')
  dnsStatus() {
    return { ovhConfigured: this.nodeDns.isConfigured() };
  }

  /**
   * One-click branded nameserver provisioning at OVH for this node:
   * creates/reconciles A/AAAA + glue records and assigns NS to the node.
   */
  @Post(':id/nameservers/provision')
  provisionNameservers(
    @Param('id') id: string,
    @Body() dto: ProvisionNsDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.nodeDns.provisionNodeNameservers(id, {
      actorUserId: user.userId,
      ipv6: dto.ipv6 ?? null,
    });
  }

  @Patch(':id/directadmin')
  setDirectAdmin(
    @Param('id') id: string,
    @Body() dto: UpdateDirectAdminConfigDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.servers.setDirectAdminConfig(id, dto, user.userId);
  }

  @Post(':id/directadmin/test')
  testDirectAdmin(@Param('id') id: string) {
    return this.servers.testDirectAdmin(id);
  }

  /**
   * Sprint 4 / A-08 — toggle maintenance mode (audytowany, blokuje
   * NodeSelector przy nowych provisioningach).
   */
  @Post(':id/maintenance')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_MANAGE')
  setMaintenance(
    @Param('id') id: string,
    @Body() dto: MaintenanceModeDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.servers.setMaintenanceMode(id, user.userId, {
      enable: dto.enable,
      reason: dto.reason,
    });
  }

  /**
   * OPS-1 — polityka pojemności węzła (cordon / max kont / rezerwa headroom).
   * Niezależna od MAINTENANCE — nie wstrzymuje sprzedaży globalnie.
   */
  @Post(':id/capacity-policy')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_MANAGE')
  setCapacityPolicy(
    @Param('id') id: string,
    @Body()
    dto: {
      acceptsNewAccounts?: boolean;
      maxAccounts?: number | null;
      reservedHeadroomPercent?: number;
    },
    @CurrentUser() user: { userId: string },
  ) {
    return this.servers.setCapacityPolicy(id, user.userId, dto);
  }

  /** OPS-4 — drain węzła (cordon, bez ruszania danych). */
  @Post(':id/drain')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_MANAGE')
  drainNode(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
    @CurrentUser() user: { userId: string },
  ) {
    return this.servers.drainNode(id, user.userId, dto?.reason);
  }

  /** OPS-4 — read-only plan migracji kont z węzła (sugerowane cele). */
  @Get(':id/migration-plan')
  migrationPlan(@Param('id') id: string) {
    return this.servers.getNodeMigrationPlan(id);
  }

  @Post(':id/hosting-profile/run')
  queueHostingProfile(
    @Param('id') id: string,
    @Body() dto: QueueHostingProfileTaskDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.nodeTasks.queueHostingProfile(id, user.userId, {
      skipBuild: dto.skipBuild,
      dryRun: dto.dryRun,
    });
  }

  @Get(':id/hosting-profile/tasks')
  listHostingProfileTasks(@Param('id') id: string) {
    return this.nodeTasks.listHostingProfileTasks(id);
  }

  /**
   * VER-UPG — zleca upgrade silnika MariaDB węzła do wybranej wersji LTS
   * (11.4 / 11.8 / 12.3). Agent robi pełny backup baz, potem CustomBuild.
   */
  @Post(':id/db-upgrade')
  queueDbUpgrade(
    @Param('id') id: string,
    @Body() dto: QueueDbUpgradeDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.nodeTasks.queueDbUpgrade(id, user.userId, dto.version);
  }

  @Get(':id/db-upgrade/tasks')
  listDbUpgradeTasks(@Param('id') id: string) {
    return this.nodeTasks.listDbUpgradeTasks(id);
  }

  /** Sondy TCP/TLS + status agenta — podsumowanie usług hostingowych na węźle. */
  @Get(':id/stack-readiness')
  stackReadiness(@Param('id') id: string) {
    return this.nodeStack.getReadiness(id);
  }

  /**
   * Zleca profil hostingowy (Exim, Dovecot, FTP, Governor, CageFS, MariaDB).
   * Idempotentny — bezpieczny do ponowienia.
   */
  @Post(':id/stack-readiness/ensure')
  ensureStack(
    @Param('id') id: string,
    @Body() dto: QueueHostingProfileTaskDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.nodeStack.ensureStack(id, user.userId, dto.skipBuild !== false);
  }

  /** Nadpisuje pakiety DA realnymi limitami planów (naprawa „Bez ograniczeń”). */
  @Post(':id/stack-readiness/repair-packages')
  repairDaPackages(@Param('id') id: string) {
    return this.nodeStack.repairDaPackages(id);
  }

  @Get(':id/tasks-agent/install-script')
  tasksAgentInstallScript() {
    return { script: renderNodeTasksAgentInstallScript() };
  }

  /**
   * Read-only node audit (two-phase validators). Safe to run on a production
   * node with live customers — performs only reads against DA API / DB / DNS / TLS.
   */
  @Get(':id/audit')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('NODES_VIEW')
  audit(@Param('id') id: string) {
    return this.nodeAudit.runAudit(id);
  }

  /**
   * Runs a single repair action for a detected non-compliance. `danger`
   * repairs require `confirm` equal to the server name (enforced in the service).
   */
  @Post(':id/repair/:actionId')
  repair(
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() dto: NodeRepairDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.nodeAudit.runRepair(id, actionId, user.userId, { confirm: dto.confirm });
  }
}
