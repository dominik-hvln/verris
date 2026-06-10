import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ServerStatus } from '@verris/database';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';

/**
 * Node agent statuses allowed to talk to agent endpoints. PENDING_APPROVAL is
 * required because the bootstrap installs and verifies the agents (lease,
 * probes, LVE) *before* the admin approves the node.
 */
const AGENT_ALLOWED_STATUSES: ServerStatus[] = [
  ServerStatus.ACTIVE,
  ServerStatus.MAINTENANCE,
  ServerStatus.PENDING_APPROVAL,
];

/**
 * Authenticates an authenticated node agent (post-bootstrap) by validating
 * the server-scoped identityToken. Required headers:
 *   X-Server-Id:    <server uuid>
 *   X-Server-Token: <identity token from handshake response>
 *
 * Audit F-03: the DB stores ONLY the SHA-256 hash of the identity token (the
 * plaintext is delivered to the node exactly once during the handshake).
 * Legacy rows that still hold the plaintext are accepted once and upgraded
 * to the hash in place (lazy migration — no node-side action required).
 *
 * Audit F-17: nodes outside ACTIVE/MAINTENANCE/PENDING_APPROVAL (e.g.
 * OFFLINE, DEPROVISIONING) are rejected even with a valid token.
 *
 * On success, sets request.serverId to the authenticated server.
 */
@Injectable()
export class ServerIdentityGuard implements CanActivate {
  private readonly logger = new Logger(ServerIdentityGuard.name);

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

    if (!server || !server.identityToken) {
      throw new UnauthorizedException('Invalid server identity');
    }

    const presentedHash = this.crypto.sha256Hex(token);
    const matchesHash = this.crypto.safeEqual(presentedHash, server.identityToken);

    if (!matchesHash) {
      // Legacy plaintext row — accept once, then upgrade to the hash so the
      // plaintext disappears from the DB without any node-side rotation.
      const matchesLegacyPlaintext = this.crypto.safeEqual(token, server.identityToken);
      if (!matchesLegacyPlaintext) {
        throw new UnauthorizedException('Invalid server identity');
      }
      await this.prisma.server.update({
        where: { id: server.id },
        data: { identityToken: presentedHash },
      });
      this.logger.log(
        `Upgraded legacy plaintext identity token to SHA-256 for server=${server.id}`,
      );
    }

    if (!AGENT_ALLOWED_STATUSES.includes(server.status)) {
      throw new UnauthorizedException(
        `Server status ${server.status} is not allowed to use agent endpoints`,
      );
    }

    req.serverId = server.id;
    return true;
  }
}
