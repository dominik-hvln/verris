import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { BootstrapTokenService } from '../bootstrap-token.service';

/**
 * Guards a route by requiring a valid X-Bootstrap-Token header.
 *
 * When this guard succeeds, request.bootstrapServerId is set to the id of the
 * Server the token was issued for. The token is consumed (marked as used).
 */
@Injectable()
export class BootstrapTokenGuard implements CanActivate {
  constructor(private readonly tokens: BootstrapTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { bootstrapServerId?: string }>();
    const headerVal = req.headers['x-bootstrap-token'];
    const token = Array.isArray(headerVal) ? headerVal[0] : headerVal;

    if (!token) {
      throw new UnauthorizedException('Missing X-Bootstrap-Token header');
    }

    const consumed = await this.tokens.consume(token, {
      ipAddress: (req.ip || req.socket?.remoteAddress) ?? undefined,
    });

    req.bootstrapServerId = consumed.serverId;
    return true;
  }
}
