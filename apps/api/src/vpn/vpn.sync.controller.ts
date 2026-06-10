import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Header,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { VpnService } from './vpn.service';
import { SkipRateLimit } from '../common/guards/rate-limit.guard';

/**
 * Host-side sync agent auth: static token from env (the sync script runs on
 * the same host as the API; the token never leaves it). Constant-time compare.
 */
@Injectable()
export class VpnSyncTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = (process.env.VPN_SYNC_TOKEN ?? '').trim();
    if (!expected) {
      throw new ServiceUnavailableException('VPN_SYNC_TOKEN nie jest skonfigurowany');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const headerVal = req.headers['x-vpn-sync-token'];
    const presented = (Array.isArray(headerVal) ? headerVal[0] : headerVal) ?? '';
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid VPN sync token');
    }
    return true;
  }
}

/** Pull endpoint for the host-side `vpn-sync-peers.sh` (systemd timer). */
@Controller('agent/vpn')
@UseGuards(VpnSyncTokenGuard)
export class VpnSyncController {
  constructor(private readonly vpn: VpnService) {}

  @Get('peers-config')
  @SkipRateLimit()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  peersConfig() {
    return this.vpn.renderServerPeersConfig();
  }
}
