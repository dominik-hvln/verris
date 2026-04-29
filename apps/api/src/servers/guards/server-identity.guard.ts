import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';

/**
 * Authenticates an authenticated node agent (post-bootstrap) by validating
 * the server-scoped identityToken. Required headers:
 *   X-Server-Id:    <server uuid>
 *   X-Server-Token: <identity token from handshake response>
 *
 * On success, sets request.serverId to the authenticated server.
 */
@Injectable()
export class ServerIdentityGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { serverId?: string }>();
    const serverIdHeader = req.headers['x-server-id'];
    const tokenHeader = req.headers['x-server-token'];

    const serverId = Array.isArray(serverIdHeader) ? serverIdHeader[0] : serverIdHeader;
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

    if (!serverId || !token) {
      throw new UnauthorizedException('Missing X-Server-Id or X-Server-Token header');
    }

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, identityToken: true, status: true },
    });

    if (!server || !server.identityToken || !this.crypto.safeEqual(token, server.identityToken)) {
      throw new UnauthorizedException('Invalid server identity');
    }

    req.serverId = server.id;
    return true;
  }
}
