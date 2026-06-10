import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import type { BootstrapToken } from '@verris/database';

const TOKEN_PREFIX = 'eko_btk_';
const DEFAULT_TTL_HOURS = 48;

export interface IssuedBootstrapToken {
  token: BootstrapToken;
  /** The plaintext token — only available at the moment of generation. */
  plaintext: string;
}

@Injectable()
export class BootstrapTokenService {
  private readonly logger = new Logger(BootstrapTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Generates a new single-use bootstrap token for a given server.
   *
   * The plaintext is returned exactly once and never persisted.
   */
  async issue(opts: {
    serverId: string;
    createdById?: string | null;
    ttlHours?: number;
  }): Promise<IssuedBootstrapToken> {
    const ttlHours = opts.ttlHours ?? DEFAULT_TTL_HOURS;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const random = this.crypto.generateRandomToken(32);
    const plaintext = TOKEN_PREFIX + random;
    const tokenHash = this.crypto.sha256Hex(plaintext);

    const token = await this.prisma.bootstrapToken.create({
      data: {
        tokenHash,
        serverId: opts.serverId,
        createdById: opts.createdById ?? null,
        expiresAt,
      },
    });

    return { token, plaintext };
  }

  /**
   * Validates a presented plaintext token WITHOUT consuming it. Audit F-13:
   * the handshake must be able to no-op for already-ACTIVE nodes without
   * burning a freshly issued token — consumption happens explicitly via
   * {@link markUsed} once the handshake actually mutates the server.
   */
  async peek(plaintext: string): Promise<BootstrapToken & { server: { id: string } }> {
    if (!plaintext || !plaintext.startsWith(TOKEN_PREFIX)) {
      throw new UnauthorizedException('Invalid bootstrap token format');
    }

    const tokenHash = this.crypto.sha256Hex(plaintext);
    const found = await this.prisma.bootstrapToken.findUnique({
      where: { tokenHash },
      include: { server: { select: { id: true } } },
    });

    if (!found) {
      throw new UnauthorizedException('Unknown bootstrap token');
    }
    if (found.usedAt) {
      throw new UnauthorizedException('Bootstrap token already used');
    }
    if (found.revokedAt) {
      throw new UnauthorizedException('Bootstrap token revoked');
    }
    if (found.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Bootstrap token expired');
    }

    return found;
  }

  /**
   * Marks a token as used. `updateMany` with the `usedAt: null` filter keeps
   * this race-safe — two concurrent handshakes can both pass `peek`, but only
   * one wins the consumption.
   */
  async markUsed(id: string, opts?: { ipAddress?: string }): Promise<void> {
    await this.prisma.bootstrapToken.updateMany({
      where: { id, usedAt: null },
      data: {
        usedAt: new Date(),
        usedFromIp: opts?.ipAddress ?? null,
      },
    });
  }

  /**
   * Validates a presented plaintext token. On success returns the BootstrapToken
   * record and marks it as used. Throws UnauthorizedException otherwise.
   */
  async consume(plaintext: string, opts?: { ipAddress?: string }): Promise<BootstrapToken & { server: { id: string } }> {
    const found = await this.peek(plaintext);
    await this.markUsed(found.id, opts);
    return found;
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.bootstrapToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}
