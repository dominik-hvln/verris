import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { DeliverabilityService } from '../deliverability/deliverability.service';
import { HostingDnsPointingService } from './hosting-dns-pointing.service';
import { buildHints, type AssistantHint } from './assistant-hints';

export const ASSISTANT_FIX_APPLIED = 'ASSISTANT_FIX_APPLIED';
export const ASSISTANT_FIX_UNDONE = 'ASSISTANT_FIX_UNDONE';
const UNDO_WINDOW_MS = 7 * 86_400_000;
/**
 * Dymki mają być podpowiedzią, nie hamulcem: sondy na żywo (DNS domeny, strefa
 * w DA) dostają limit czasu, a gdy nie zdążą, po prostu pomijamy ich reguły.
 * Bez tego martwy węzeł (15 s na próbę) zatrzymywał ładowanie strony usługi.
 */
const PROBE_BUDGET_MS = 3_000;
const within = <T>(p: Promise<T>, ms = PROBE_BUDGET_MS): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

type Rec = { name: string; type: string; value: string };
const isRec = (v: unknown): v is Rec =>
  !!v && typeof v === 'object' && ['name', 'type', 'value'].every((k) => typeof (v as Record<string, unknown>)[k] === 'string');

/**
 * PB-17 — asystent v1. Dymki z reguł (assistant-hints.ts) i naprawy jednym
 * kliknięciem wyłącznie odwracalne: w v1 to dopisanie/poprawa rekordu SPF lub
 * DMARC w strefie Verris. Każda naprawa i każde cofnięcie ląduje w audycie;
 * cofnięcie bierze dane z wpisu audytu, nigdy od klienta.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
    private readonly deliverability: DeliverabilityService,
    private readonly pointing: HostingDnsPointingService,
  ) {}

  async hints(subscriptionId: string, userId: string): Promise<AssistantHint[]> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: {
        account: {
          select: {
            domain: true,
            diskLimitMb: true,
            status: true,
            server: { select: { lastOffsiteBackupAt: true, lastOffsiteBackupOk: true } },
          },
        },
        siteMonitor: { select: { tlsExpiresAt: true } },
        usageMetrics: { orderBy: { bucketStart: 'desc' }, take: 1, select: { diskUsageMb: true } },
      },
    });
    if (!sub) throw new NotFoundException('Service not found');
    const account = sub.account;
    if (!account || account.status !== 'ACTIVE') return [];

    const [domainRow, pointing, mail] = await Promise.all([
      account.domain
        ? this.prisma.domain.findFirst({ where: { userId, name: account.domain }, select: { name: true, expiresAt: true, autoRenew: true } })
        : null,
      within(this.pointing.verifyForSubscription(subscriptionId, userId)),
      within(this.deliverability.forSubscription(subscriptionId, userId)),
    ]);
    const usage = sub.usageMetrics[0];

    return buildHints({
      now: new Date(),
      domain: account.domain,
      disk: usage ? { usedMb: usage.diskUsageMb, limitMb: account.diskLimitMb } : null,
      tlsExpiresAt: sub.siteMonitor?.tlsExpiresAt ?? null,
      domainExpiry: domainRow?.expiresAt ? { name: domainRow.name, expiresAt: domainRow.expiresAt, autoRenew: domainRow.autoRenew } : null,
      backup: account.server ? { lastAt: account.server.lastOffsiteBackupAt, ok: account.server.lastOffsiteBackupOk } : null,
      pointing: pointing ? { status: pointing.status, message: pointing.message } : null,
      mail: (mail?.checks ?? []).map((c) => ({ key: c.key, status: c.status, detail: c.detail, suggestion: c.suggestion })),
      usesPlatformDns: mail?.usesPlatformDns ?? null,
    });
  }

  async applyFix(subscriptionId: string, userId: string, actorUserId: string, key: 'spf' | 'dmarc') {
    // Sugestię liczymy od nowa po stronie serwera — klient mówi tylko „napraw SPF”.
    const report = await this.deliverability.forSubscription(subscriptionId, userId);
    const s = report.checks.find((c) => c.key === key)?.suggestion;
    if (!report.domain || !s || s.inZone || report.usesPlatformDns === false) {
      throw new BadRequestException('Tej poprawki nie da się już zrobić automatycznie — odśwież stronę.');
    }
    const domain = report.domain;
    const created: Rec = { name: s.host, type: s.type, value: s.value };
    await this.directAdmin.createHostingDnsRecord(subscriptionId, userId, { domain, ...created, ttl: 3600 });
    if (s.replaces) await this.directAdmin.deleteHostingDnsRecord(subscriptionId, userId, { domain, ...s.replaces });
    const log = await this.prisma.auditLog.create({
      data: {
        action: ASSISTANT_FIX_APPLIED,
        userId,
        actorUserId,
        details: { subscriptionId, key, domain, created, removed: s.replaces ? ({ ...s.replaces } as Rec) : null },
      },
      select: { id: true },
    });
    return { ok: true as const, undoId: log.id, record: created };
  }

  async undoFix(subscriptionId: string, userId: string, actorUserId: string, undoId: string) {
    const log = await this.prisma.auditLog.findFirst({ where: { id: undoId, userId, action: ASSISTANT_FIX_APPLIED } });
    const d = (log?.details ?? null) as Record<string, unknown> | null;
    if (!log || !d || d.subscriptionId !== subscriptionId || typeof d.domain !== 'string' || !isRec(d.created)) {
      throw new NotFoundException('Nie znaleziono tej poprawki.');
    }
    if (Date.now() - log.createdAt.getTime() > UNDO_WINDOW_MS) {
      throw new BadRequestException('Poprawkę można cofnąć do 7 dni — zmień rekord ręcznie w zakładce DNS.');
    }
    const done = await this.prisma.auditLog.findFirst({
      where: { action: ASSISTANT_FIX_UNDONE, userId, details: { path: ['appliedId'], equals: undoId } },
      select: { id: true },
    });
    if (done) throw new ConflictException('Ta poprawka została już cofnięta.');

    const domain = d.domain;
    if (isRec(d.removed)) await this.directAdmin.createHostingDnsRecord(subscriptionId, userId, { domain, ...d.removed, ttl: 3600 });
    await this.directAdmin.deleteHostingDnsRecord(subscriptionId, userId, { domain, ...d.created });
    await this.audit.record({
      action: ASSISTANT_FIX_UNDONE,
      userId,
      actorUserId,
      details: { subscriptionId, appliedId: undoId, key: typeof d.key === 'string' ? d.key : null, domain },
    });
    return { ok: true as const };
  }
}
