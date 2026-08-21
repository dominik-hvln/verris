import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ALL_API_SCOPES, isValidScope, type ApiScopeValue } from './api-scopes';

interface TokenRow {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  hash: string;
  scopes: string[];
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Minimalny delegate Prisma — klient regenerowany w buildzie prod (Dockerfile.api). */
interface TokenDelegate {
  findUnique(a: { where: { prefix: string } }): Promise<TokenRow | null>;
  findMany(a: Record<string, unknown>): Promise<TokenRow[]>;
  findFirst(a: Record<string, unknown>): Promise<TokenRow | null>;
  create(a: { data: Record<string, unknown> }): Promise<TokenRow>;
  update(a: { where: { id: string }; data: Record<string, unknown> }): Promise<TokenRow>;
  count(a: Record<string, unknown>): Promise<number>;
}

export interface PublicTokenView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const MAX_ACTIVE_TOKENS = 25;

@Injectable()
export class ApiTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get repo(): TokenDelegate {
    return (this.prisma as unknown as { apiToken: TokenDelegate }).apiToken;
  }

  private view(t: TokenRow): PublicTokenView {
    return {
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      scopes: t.scopes,
      lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
      expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
      revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    };
  }

  async list(userId: string): Promise<PublicTokenView[]> {
    const rows = await this.repo.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((r) => this.view(r));
  }

  /** Tworzy token; zwraca pełny sekret DOKŁADNIE RAZ (nie da się go odzyskać). */
  async create(
    userId: string,
    input: { name: string; scopes: string[]; expiresInDays?: number | null },
  ): Promise<{ token: string; view: PublicTokenView }> {
    const name = (input.name ?? '').trim();
    if (name.length < 2 || name.length > 60) {
      throw new BadRequestException('Nazwa tokenu: 2–60 znaków.');
    }
    const scopes = Array.from(new Set((input.scopes ?? []).filter(isValidScope))) as ApiScopeValue[];
    if (scopes.length === 0) {
      throw new BadRequestException('Wybierz co najmniej jedno uprawnienie.');
    }
    const active = await this.repo.count({ where: { userId, revokedAt: null } });
    if (active >= MAX_ACTIVE_TOKENS) {
      throw new BadRequestException(`Osiągnięto limit ${MAX_ACTIVE_TOKENS} aktywnych tokenów. Unieważnij nieużywane.`);
    }

    const prefix = `vrs_live_${randomBytes(6).toString('hex')}`; // publiczny, unikalny
    const secret = randomBytes(24).toString('hex'); // sekret
    const hash = await bcrypt.hash(secret, 12);
    let expiresAt: Date | null = null;
    if (input.expiresInDays && input.expiresInDays > 0) {
      expiresAt = new Date(Date.now() + Math.min(input.expiresInDays, 3650) * 864e5);
    }

    const row = await this.repo.create({
      data: { userId, name, prefix, hash, scopes, expiresAt },
    });
    await this.audit.record({ action: 'API_TOKEN_CREATED', userId, details: { tokenId: row.id, prefix, scopes } });

    return { token: `${prefix}.${secret}`, view: this.view(row) };
  }

  async revoke(userId: string, id: string): Promise<void> {
    const row = await this.repo.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Token nie istnieje.');
    if (row.revokedAt) return;
    await this.repo.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record({ action: 'API_TOKEN_REVOKED', userId, details: { tokenId: id, prefix: row.prefix } });
  }

  /**
   * Weryfikacja tokenu z nagłówka Authorization. Zwraca kontekst lub null.
   * Format: "<prefix>.<secret>" gdzie prefix = vrs_live_xxxxxxxxxxxx.
   */
  async verify(raw: string, ip?: string): Promise<{ userId: string; scopes: string[]; tokenId: string } | null> {
    if (!raw) return null;
    const dot = raw.indexOf('.');
    if (dot < 0) return null;
    const prefix = raw.slice(0, dot);
    const secret = raw.slice(dot + 1);
    if (!prefix.startsWith('vrs_live_') || secret.length < 16) return null;

    const row = await this.repo.findUnique({ where: { prefix } });
    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    const ok = await bcrypt.compare(secret, row.hash);
    if (!ok) return null;

    // Throttled write: aktualizujemy lastUsed maks. co ~60 s, by nie obciążać DB.
    const last = row.lastUsedAt ? row.lastUsedAt.getTime() : 0;
    if (Date.now() - last > 60_000) {
      this.repo
        .update({ where: { id: row.id }, data: { lastUsedAt: new Date(), lastUsedIp: ip ?? row.lastUsedIp ?? null } })
        .catch(() => undefined);
    }
    return { userId: row.userId, scopes: row.scopes, tokenId: row.id };
  }

  scopesCatalog(): ApiScopeValue[] {
    return ALL_API_SCOPES;
  }
}
