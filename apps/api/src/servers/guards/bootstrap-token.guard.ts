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
 * When this guard succeeds, request.bootstrapServerId / bootstrapTokenId are
 * set. Audit F-13: the token is only VALIDATED here — the handshake service
 * consumes it explicitly once it actually mutates the server, so a re-run of
 * the bootstrap script against an already-ACTIVE node does not burn a token.
 */
@Injectable()
export class BootstrapTokenGuard implements CanActivate {
  constructor(private readonly tokens: BootstrapTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { bootstrapServerId?: string; bootstrapTokenId?: string }>();
    const headerVal = req.headers['x-bootstrap-token'];
    const token = Array.isArray(headerVal) ? headerVal[0] : headerVal;

    if (!token) {
      throw new UnauthorizedException('Missing X-Bootstrap-Token header');
    }

    const peeked = await this.tokens.peek(token);

    req.bootstrapServerId = peeked.serverId;
    req.bootstrapTokenId = peeked.id;
    return true;
  }
}
