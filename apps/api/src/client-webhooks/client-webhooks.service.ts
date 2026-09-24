import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NodeTaskKind, Prisma, StatusWebhookDeliveryStatus } from '@verris/database';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { assertPublicWebhookUrl } from '../status/status-webhook.service';

/**
 * L-10 — webhooki klienta. Klient podaje adres HTTPS i zdarzenia; dostaje sekret raz, każde
 * wywołanie ma podpis `x-verris-signature` = HMAC-SHA256(sekret, treść). Adres sprawdzany przy
 * zapisie i przy każdej wysyłce (bez adresów prywatnych — SSRF), bez przekierowań, 5 prób.
 */
export const ZDARZENIA = ['task.completed', 'task.failed', 'invoice.issued', 'subscription.renewed', 'subscription.past_due'] as const;
export type Zdarzenie = (typeof ZDARZENIA)[number] | 'ping';
const MAX_ADRESOW = 5;
const MAX_PROB = 5;
const DZIERZAWA_MS = 2 * 60_000;

/** Rodzaje zadań, o których klient może chcieć wiedzieć (bez zadań operatorskich na węźle). */
const ZADANIA_KLIENTA = new Set<string>([
  NodeTaskKind.WP_INSTALL, NodeTaskKind.WP_UPDATE, NodeTaskKind.APP_INSTALL, NodeTaskKind.STAGING_SYNC, NodeTaskKind.PHP_APPLY,
  NodeTaskKind.WAF_APPLY, NodeTaskKind.DB_TRANSFER, NodeTaskKind.FILE_RESTORE, NodeTaskKind.OFFSITE_RESTORE, NodeTaskKind.SSH_ACCESS,
  NodeTaskKind.DISK_USAGE, NodeTaskKind.MALWARE_SCAN, NodeTaskKind.REDIS_ACCESS, NodeTaskKind.MAIL_LOG, NodeTaskKind.GIT_DEPLOY,
  NodeTaskKind.SITE_CLONE, NodeTaskKind.HTACCESS, NodeTaskKind.PHP_INFO, NodeTaskKind.FILE_SEARCH,
]);

@Injectable()
export class ClientWebhooksService {
  private readonly logger = new Logger(ClientWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async lista(userId: string) {
    const adresy = await this.prisma.clientWebhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    return {
      zdarzenia: ZDARZENIA,
      adresy: adresy.map((a) => ({
        id: a.id,
        url: a.url,
        zdarzenia: a.events,
        utworzony: a.createdAt.toISOString(),
        dostawy: a.deliveries.map((d) => ({
          id: d.id,
          zdarzenie: d.event,
          status: d.status,
          proby: d.attempts,
          kod: d.responseStatus,
          blad: d.lastError?.slice(0, 200) ?? null,
          utworzona: d.createdAt.toISOString(),
        })),
      })),
    };
  }

  async dodaj(userId: string, input: { url: string; events: string[] }) {
    const url = (input.url ?? '').trim();
    const zdarzenia = [...new Set(input.events ?? [])];
    if (!zdarzenia.length || zdarzenia.some((z) => !(ZDARZENIA as readonly string[]).includes(z))) {
      throw new BadRequestException('Wybierz zdarzenia z listy.');
    }
    try {
      await assertPublicWebhookUrl(url);
    } catch (e) {
      throw new BadRequestException(`Adres webhooka: ${(e as Error).message === 'Webhook URL must use HTTPS.' ? 'wymagany https://' : 'musi być publicznym adresem https:// bez loginu i hasła'}.`);
    }
    if ((await this.prisma.clientWebhookEndpoint.count({ where: { userId } })) >= MAX_ADRESOW) {
      throw new BadRequestException(`Najwyżej ${MAX_ADRESOW} adresy webhooków na konto.`);
    }
    const sekret = `whsec_${randomBytes(24).toString('base64url')}`;
    const a = await this.prisma.clientWebhookEndpoint.create({
      data: { userId, url, events: zdarzenia, secretEnc: this.crypto.encrypt(sekret) },
    });
    await this.audit.record({ action: 'CLIENT_WEBHOOK_CREATED', userId, details: { id: a.id, url, events: zdarzenia } });
    return { id: a.id, sekret };
  }

  async usun(userId: string, id: string) {
    const r = await this.prisma.clientWebhookEndpoint.deleteMany({ where: { id, userId } });
    if (!r.count) throw new NotFoundException('Nie ma takiego webhooka.');
    await this.audit.record({ action: 'CLIENT_WEBHOOK_DELETED', userId, details: { id } });
    return { ok: true };
  }

  /** Testowe wywołanie „ping” — od razu w kolejce, wynik widać w liście dostaw. */
  async test(userId: string, id: string) {
    const a = await this.prisma.clientWebhookEndpoint.findFirst({ where: { id, userId } });
    if (!a) throw new NotFoundException('Nie ma takiego webhooka.');
    await this.prisma.clientWebhookDelivery.create({ data: { endpointId: a.id, event: 'ping', payload: { wiadomosc: 'Test webhooka Verris' } } });
    return { ok: true };
  }

  /** Wywoływane przez usługi — nigdy nie rzuca (webhook nie może zepsuć głównej operacji). */
  async emit(userId: string, event: Zdarzenie, payload: Prisma.InputJsonValue) {
    try {
      const adresy = await this.prisma.clientWebhookEndpoint.findMany({ where: { userId, isActive: true, events: { has: event } }, select: { id: true } });
      if (!adresy.length) return;
      await this.prisma.clientWebhookDelivery.createMany({ data: adresy.map((a) => ({ endpointId: a.id, event, payload })) });
    } catch (e) {
      this.logger.warn(`client webhook emit ${event} user=${userId}: ${(e as Error).message}`);
    }
  }

  /** Zakończone zadanie węzła → zdarzenie dla właściciela konta hostingowego (jeśli rodzaj jest „klienta”). */
  async poZadaniu(task: { id: string; kind: string; accountId: string | null; payload: unknown }, ok: boolean) {
    if (!task.accountId || !ZADANIA_KLIENTA.has(task.kind)) return;
    const sub = await this.prisma.subscription.findFirst({ where: { account: { id: task.accountId } }, select: { id: true, userId: true } }).catch(() => null);
    if (!sub) return;
    const p = (task.payload ?? {}) as { domain?: string; mode?: string };
    await this.emit(sub.userId, ok ? 'task.completed' : 'task.failed', {
      zadanie: task.id,
      rodzaj: task.kind,
      tryb: p.mode ?? null,
      domena: p.domain ?? null,
      usluga: sub.id,
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async dostarczaj(): Promise<void> {
    const teraz = new Date();
    const kandydaci = await this.prisma.clientWebhookDelivery.findMany({
      where: { status: StatusWebhookDeliveryStatus.PENDING, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: teraz } }] },
      orderBy: { createdAt: 'asc' },
      take: 25,
      select: { id: true },
    });
    for (const k of kandydaci) {
      const zajete = await this.prisma.clientWebhookDelivery.updateMany({
        where: { id: k.id, status: StatusWebhookDeliveryStatus.PENDING, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: teraz } }] },
        data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + DZIERZAWA_MS) },
      });
      if (zajete.count !== 1) continue;
      const d = await this.prisma.clientWebhookDelivery.findUnique({ where: { id: k.id }, include: { endpoint: true } });
      if (!d) continue;
      const body = JSON.stringify({ id: d.id, event: d.event, createdAt: d.createdAt.toISOString(), payload: d.payload });
      try {
        await assertPublicWebhookUrl(d.endpoint.url);
        const res = await fetch(d.endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-verris-event': d.event,
            'x-verris-delivery': d.id,
            'x-verris-signature': createHmac('sha256', this.crypto.decrypt(d.endpoint.secretEnc)).update(body).digest('hex'),
          },
          body,
          signal: AbortSignal.timeout(10_000),
          redirect: 'manual',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await this.prisma.clientWebhookDelivery.update({
          where: { id: d.id },
          data: { status: StatusWebhookDeliveryStatus.SENT, responseStatus: res.status, deliveredAt: new Date(), lastError: null, nextAttemptAt: null },
        });
      } catch (e) {
        const koniec = d.attempts >= MAX_PROB;
        await this.prisma.clientWebhookDelivery.update({
          where: { id: d.id },
          data: {
            status: koniec ? StatusWebhookDeliveryStatus.FAILED : StatusWebhookDeliveryStatus.PENDING,
            lastError: (e as Error).message,
            nextAttemptAt: koniec ? null : new Date(Date.now() + Math.min(30, 2 ** d.attempts) * 60_000),
          },
        });
      }
    }
  }
}
