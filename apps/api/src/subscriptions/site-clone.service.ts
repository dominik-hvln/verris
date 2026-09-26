import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { HostingResourceActions } from '../common/audit/audit.actions.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { WpUpdateService } from './wp-update.service.js';

/**
 * I-13 — kopia strony na inną domenę konta (`ops/scripts/node-site-clone.sh`, zadanie SITE_CLONE).
 * Dla WordPressa API zakłada w DirectAdminie nową bazę (tak jak instalator WP), bo tylko DA ją
 * tworzy; o tym, czy źródło to WordPress, wiemy z ostatniego sprawdzenia w zakładce WordPress.
 * Dotychczasowe pliki domeny docelowej skrypt odkłada obok — nic nie znika.
 */
@Injectable()
export class SiteCloneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
    private readonly wp: WpUpdateService,
  ) {}

  async status(subscriptionId: string, userId: string) {
    const { account } = await this.wymagajKonta(subscriptionId, userId);
    return this.opis(account.id);
  }

  async klonuj(subscriptionId: string, userId: string, input: { source: string; target: string }) {
    const { sub, account } = await this.wymagajKonta(subscriptionId, userId);
    const zrodlo = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, input.source);
    const cel = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, input.target);
    if (zrodlo === cel) throw new BadRequestException('Wybierz inną domenę docelową.');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.SITE_CLONE, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Kopiowanie strony już trwa.');

    const wp = await this.wp.status(subscriptionId, userId, zrodlo);
    let baza: { dbName: string; dbUser: string; dbPass: string } | null = null;
    if (wp.stan) {
      const krotka = `kl${randomBytes(3).toString('hex')}`;
      const dbPass = randomBytes(18).toString('base64url');
      const client = await this.directAdmin.getClientForHostingAccount(account.id, userId);
      const db = await client.createMysqlDatabase({ name: krotka, user: krotka, password: dbPass });
      baza = { dbName: db.database, dbUser: db.username, dbPass };
    }
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.SITE_CLONE,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { daUser: account.daUsername, source: zrodlo, target: cel, ...(baza ?? {}) },
      },
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_SITE_CLONE_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, source: zrodlo, target: cel, nowaBaza: baza?.dbName ?? null, taskId: task.id },
    });
    return this.opis(account.id);
  }

  private async opis(accountId: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.SITE_CLONE },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    return {
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      kopie: zadania.map((z) => {
        const p = (z.payload ?? {}) as { source?: string; target?: string; dbName?: string };
        const log = z.outputLog ?? '';
        return {
          id: z.id,
          zrodlo: p.source ?? null,
          cel: p.target ?? null,
          status: z.status,
          utworzone: z.createdAt.toISOString(),
          wordpress: /^VERRIS_KLON_WP=1\s*$/m.test(log),
          nowaBaza: p.dbName ?? null,
          poprzedniePliki: /^VERRIS_KLON_KOPIA=(domains\/[^\s|]{1,300})\s*$/m.exec(log)?.[1] ?? null,
          blad: z.status === NodeTaskStatus.FAILED ? bladZLogu(log) : null,
        };
      }),
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { sub, account: sub.account };
  }
}

function bladZLogu(log: string): string {
  const l = log.split('\n').reverse().find((x) => x.startsWith('[site-clone] BŁĄD: '));
  return l ? l.slice('[site-clone] BŁĄD: '.length).slice(0, 300) : 'Kopiowanie nie powiodło się. Napisz do nas — sprawdzimy to.';
}
