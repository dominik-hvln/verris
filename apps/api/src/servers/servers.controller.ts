import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ServersService } from './servers.service.js';
import { HandshakeDto } from './dto/handshake.dto.js';
import { BootstrapTokenGuard } from './guards/bootstrap-token.guard.js';

/**
 * Public, bootstrap-token-protected endpoint used by node agents during
 * initial registration with the control plane.
 */
@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Post('handshake')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BootstrapTokenGuard)
  async handshake(
    @Req() req: Request & { bootstrapServerId?: string; bootstrapTokenId?: string },
    @Body() dto: HandshakeDto,
  ) {
    const serverId = req.bootstrapServerId!;
    const ip = (req.ip || req.socket?.remoteAddress) ?? undefined;
    return this.servers.handleHandshake(serverId, dto, {
      ip,
      userAgent: req.headers['user-agent'],
      bootstrapTokenId: req.bootstrapTokenId,
    });
  }
}
