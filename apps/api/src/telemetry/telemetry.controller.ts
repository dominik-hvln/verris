import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TelemetryService } from './telemetry.service';
import { CloudLinuxTelemetryDto } from './telemetry.dto';
import { ServerIdentityGuard } from '../servers/guards/server-identity.guard';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post('lve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServerIdentityGuard)
  async pushLveData(
    @Req() req: Request & { serverId?: string },
    @Body() dto: CloudLinuxTelemetryDto,
  ) {
    return this.telemetry.processLveMetrics({ ...dto, serverId: req.serverId! });
  }
}
