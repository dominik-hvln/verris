import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ServersService } from './servers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@verris/database';
import { InitServerDto } from './dto/init-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { UpdateDirectAdminConfigDto } from './dto/directadmin-config.dto';
import { QueueHostingProfileTaskDto } from './dto/queue-hosting-profile.dto';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { NodeTasksService } from './node-tasks.service';
import { renderNodeTasksAgentInstallScript } from './node-tasks-agent.install';

class MaintenanceModeDto {
  @IsBoolean()
  enable!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@Controller('admin/servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ServersAdminController {
  constructor(
    private readonly servers: ServersService,
    private readonly nodeTasks: NodeTasksService,
  ) {}

  @Get()
  list() {
    return this.servers.listServers();
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
  get(@Param('id') id: string) {
    return this.servers.getServer(id);
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

  @Get(':id/tasks-agent/install-script')
  tasksAgentInstallScript() {
    return { script: renderNodeTasksAgentInstallScript() };
  }
}
