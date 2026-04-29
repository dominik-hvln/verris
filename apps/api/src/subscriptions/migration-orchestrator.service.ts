import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import {
  RequestExternalMigrationDto,
  RequestInternalMigrationDto,
} from './dto/migration.dto';

type MigrationViewRow = {
  id: string;
  type: string;
  createdAt: string;
  details: Record<string, unknown> | null;
};

@Injectable()
export class MigrationOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  private async assertSubscriptionForUser(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    return sub;
  }

  async requestExternalMigration(subscriptionId: string, userId: string, dto: RequestExternalMigrationDto) {
    const sub = await this.assertSubscriptionForUser(subscriptionId, userId);
    const sourceSecretEnc = this.crypto.encrypt(
      JSON.stringify({
        host: dto.sourceHost,
        port: dto.sourcePort,
        username: dto.sourceUsername,
        password: dto.sourcePassword,
        path: dto.sourcePath ?? null,
      }),
    );

    const event = await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'MIGRATION_EXTERNAL_REQUESTED',
        details: {
          sourceType: dto.sourceType,
          sourceHost: dto.sourceHost,
          sourcePort: dto.sourcePort,
          sourceUsername: dto.sourceUsername,
          sourcePath: dto.sourcePath ?? null,
          notes: dto.notes ?? null,
          sourceSecretEnc,
          requestedAt: new Date().toISOString(),
          accountDomain: sub.account?.domain ?? null,
          accountUsername: sub.account?.daUsername ?? null,
        },
      },
    });

    await this.audit.record({
      action: 'MIGRATION_EXTERNAL_REQUESTED',
      userId,
      actorUserId: userId,
      details: {
        subscriptionId,
        migrationEventId: event.id,
        sourceType: dto.sourceType,
        sourceHost: dto.sourceHost,
      },
    });

    return { ok: true as const, migrationId: event.id };
  }

  async requestInternalMigrationByAdmin(
    subscriptionId: string,
    actorUserId: string,
    dto: RequestInternalMigrationDto,
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const event = await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'MIGRATION_INTERNAL_REQUESTED',
        details: {
          targetServerId: dto.targetServerId,
          notes: dto.notes ?? null,
          requestedAt: new Date().toISOString(),
          requestedBy: actorUserId,
          accountDomain: sub.account?.domain ?? null,
          accountUsername: sub.account?.daUsername ?? null,
        },
      },
    });

    await this.audit.record({
      action: 'MIGRATION_INTERNAL_REQUESTED',
      userId: sub.userId,
      actorUserId,
      details: {
        subscriptionId,
        migrationEventId: event.id,
        targetServerId: dto.targetServerId,
      },
    });

    return { ok: true as const, migrationId: event.id };
  }

  async listMigrationTimelineForUser(subscriptionId: string, userId: string): Promise<MigrationViewRow[]> {
    await this.assertSubscriptionForUser(subscriptionId, userId);
    return this.listMigrationTimelineRaw(subscriptionId);
  }

  async listMigrationTimelineForAdmin(subscriptionId: string): Promise<MigrationViewRow[]> {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true } });
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.listMigrationTimelineRaw(subscriptionId);
  }

  private async listMigrationTimelineRaw(subscriptionId: string): Promise<MigrationViewRow[]> {
    const rows = await this.prisma.subscriptionEvent.findMany({
      where: { subscriptionId, type: { startsWith: 'MIGRATION_' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, type: true, createdAt: true, details: true },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      details: this.sanitizeDetails(row.details),
    }));
  }

  private sanitizeDetails(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const d = { ...(raw as Record<string, unknown>) };
    if ('sourceSecretEnc' in d) {
      d.sourceSecretEnc = '[encrypted]';
    }
    return d;
  }
}

