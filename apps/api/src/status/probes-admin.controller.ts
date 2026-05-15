import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IncidentStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProbesAdminService } from './probes-admin.service';
import { CreateProbeDto, UpdateIncidentDto, UpdateProbeDto } from './dto/probe.dto';

@Controller('admin/status')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ProbesAdminController {
  constructor(private readonly admin: ProbesAdminService) {}

  // Probes ---------------------------------------------------------------

  @Get('probes')
  @HttpCode(200)
  list(@Query('serverId') serverId?: string) {
    return this.admin.list({ serverId });
  }

  @Post('probes')
  @HttpCode(201)
  create(
    @Body() dto: CreateProbeDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.admin.create(dto, actor.userId);
  }

  @Patch('probes/:id')
  @HttpCode(200)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProbeDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.admin.update(id, dto, actor.userId);
  }

  @Delete('probes/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    await this.admin.remove(id, actor.userId);
  }

  // Incidents ------------------------------------------------------------

  @Get('incidents')
  @HttpCode(200)
  listIncidents(
    @Query('status') status?: IncidentStatus,
    @Query('serverId') serverId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.admin.listIncidents({ status, serverId, limit, offset });
  }

  @Patch('incidents/:id')
  @HttpCode(200)
  updateIncident(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.admin.updateIncident(id, dto, actor.userId);
  }

  /**
   * H-11: streams every incident matching the filter as CSV. We stream because
   * 12-month windows can have thousands of rows and we don't want to hold them
   * all in memory at once.
   */
  @Get('incidents/export.csv')
  async exportIncidents(
    @Res() res: Response,
    @Query('serverId') serverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const iterable = await this.admin.iterateIncidents({
      serverId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="incidents-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.write(
      'incident_id,server_id,server_name,probe_kind,probe_target,severity,status,started_at,resolved_at,duration_min,title,public_message\n',
    );
    for await (const row of iterable) {
      const probe = row.probe;
      const duration =
        row.resolvedAt && row.startedAt
          ? Math.round((row.resolvedAt.getTime() - row.startedAt.getTime()) / 60000)
          : '';
      res.write(
        [
          row.id,
          probe.server.id,
          csv(probe.server.name ?? ''),
          probe.kind,
          csv(probe.target),
          row.severity,
          row.status,
          row.startedAt.toISOString(),
          row.resolvedAt?.toISOString() ?? '',
          duration,
          csv(row.title),
          csv(row.publicMessage ?? ''),
        ].join(',') + '\n',
      );
    }
    res.end();
  }
}

function csv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
