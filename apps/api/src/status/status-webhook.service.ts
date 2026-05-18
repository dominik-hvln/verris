import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Prisma,
  StatusWebhookDeliveryStatus,
  StatusWebhookEvent,
} from '@verris/database';
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';

const MAX_ATTEMPTS = 5;
const WEBHOOK_LEASE_MS = 2 * 60_000;

@Injectable()
export class StatusWebhookService {
  private readonly logger = new Logger(StatusWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async enqueue(event: StatusWebhookEvent, payload: Prisma.InputJsonValue): Promise<number> {
    const endpoints = await this.prisma.statusWebhookEndpoint.findMany({
      where: { isActive: true, events: { has: event } },
      select: { id: true },
    });
    if (endpoints.length === 0) return 0;

    await this.prisma.statusWebhookDelivery.createMany({
      data: endpoints.map((endpoint) => ({
        endpointId: endpoint.id,
        event,
        payload,
        status: StatusWebhookDeliveryStatus.PENDING,
      })),
    });
    return endpoints.length;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async deliverPending(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.statusWebhookDelivery.findMany({
      where: {
        status: StatusWebhookDeliveryStatus.PENDING,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 25,
      select: { id: true },
    });

    for (const candidate of candidates) {
      const claimed = await this.prisma.statusWebhookDelivery.updateMany({
        where: {
          id: candidate.id,
          status: StatusWebhookDeliveryStatus.PENDING,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + WEBHOOK_LEASE_MS),
        },
      });
      if (claimed.count !== 1) continue;

      const delivery = await this.prisma.statusWebhookDelivery.findUnique({
        where: { id: candidate.id },
        include: { endpoint: true },
      });
      if (!delivery) continue;

      const body = JSON.stringify({
        id: delivery.id,
        event: delivery.event,
        createdAt: delivery.createdAt.toISOString(),
        payload: delivery.payload,
      });
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-verris-event': delivery.event,
        'x-verris-delivery': delivery.id,
      };
      if (delivery.endpoint.secretEnc) {
        const secret = this.crypto.decrypt(delivery.endpoint.secretEnc);
        headers['x-verris-signature'] = createHmac('sha256', secret)
          .update(body)
          .digest('hex');
      }

      try {
        await assertPublicWebhookUrl(delivery.endpoint.url);
        const response = await fetch(delivery.endpoint.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
          redirect: 'manual',
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        await this.prisma.statusWebhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: StatusWebhookDeliveryStatus.SENT,
            responseStatus: response.status,
            deliveredAt: new Date(),
            lastError: null,
            nextAttemptAt: null,
          },
        });
      } catch (err) {
        const attempts = delivery.attempts;
        const failed = attempts >= MAX_ATTEMPTS;
        await this.prisma.statusWebhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: failed
              ? StatusWebhookDeliveryStatus.FAILED
              : StatusWebhookDeliveryStatus.PENDING,
            attempts,
            lastError: err instanceof Error ? err.message : String(err),
            nextAttemptAt: failed
              ? null
              : new Date(Date.now() + Math.min(30, 2 ** attempts) * 60_000),
          },
        });
        this.logger.warn(
          `status webhook delivery failed id=${delivery.id} endpoint=${delivery.endpointId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}

export async function assertPublicWebhookUrl(raw: string): Promise<void> {
  const url = new URL(raw);
  if (url.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('Webhook URL must not contain credentials.');
  }
  const host = url.hostname;
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('Webhook URL must point to a public hostname.');
  }
  const ipLiteral = isIP(host) ? [host] : [];
  const resolved = ipLiteral.length > 0 ? ipLiteral : (await lookup(host, { all: true })).map((r) => r.address);
  if (resolved.length === 0 || resolved.some(isPrivateOrReservedIp)) {
    throw new Error('Webhook URL resolves to a private or reserved address.');
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (ip.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(ip.slice('::ffff:'.length));
  }
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80:') ||
      lower.startsWith('ff')
    );
  }
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}
