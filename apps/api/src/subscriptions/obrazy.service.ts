import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { HostingResourceActions } from '../common/audit/audit.actions.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { sprawdzKatalog } from './htaccess.service.js';

/**
 * J-06 — bezstratna optymalizacja obrazów strony (`ops/scripts/node-image-optimize.sh`, zadanie
 * IMAGE_OPTIMIZE): jpegoptim i optipng jako klient, do 5000 plików na raz, kolejne uruchomienie bierze
 * tylko nowe pliki. Opcjonalnie usuwa metadane (EXIF z lokalizacją GPS).
 */
@Injectable()
export class ObrazyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async status(subscriptionId: string, userId: string, domain: string) {
    const { account } = await this.konto(subscriptionId, userId);
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, domain);
    return this.opis(account.id, domena);
  }

  async uruchom(subscriptionId: string, userId: string, input: { domain: string; katalog: string; metadane: boolean }) {
    const { sub, account } = await this.konto(subscriptionId, userId);
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, input.domain);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const katalog = sprawdzKatalog(input.katalog);
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.IMAGE_OPTIMIZE, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Optymalizacja obrazów już trwa — poczekaj na wynik.');
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.IMAGE_OPTIMIZE,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { daUser: account.daUsername, domain: domena, dir: katalog, metadane: input.metadane ? '1' : '0' },
      },
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_IMAGES_OPTIMIZE_QUEUED,
      userId: sub.userId,
      actorUserId: userId,
      details: { subscriptionId, domain: domena, katalog, taskId: task.id },
    });
    return this.opis(account.id, domena);
  }

  private async opis(accountId: string, domena: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.IMAGE_OPTIMIZE, payload: { path: ['domain'], equals: domena } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const udane = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED && wynikZLogu(z.outputLog));
    const ostatnie = zadania[0] ?? null;
    return {
      domena,
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      ostatni: udane
        ? {
            ...wynikZLogu(udane.outputLog)!,
            katalog: (udane.payload as { dir?: string } | null)?.dir ?? '',
            kiedy: (udane.completedAt ?? udane.createdAt).toISOString(),
          }
        : null,
      blad: ostatnie?.status === NodeTaskStatus.FAILED ? bladZLogu(ostatnie.outputLog) : null,
    };
  }

  private async konto(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { sub, account: sub.account };
  }
}

export function wynikZLogu(log: string | null): { plikow: number; przed: number; po: number; zostalo: number } | null {
  const m = /^VERRIS_IMG=(\d+) (\d+) (\d+) (\d+)\s*$/m.exec(log ?? '');
  return m ? { plikow: Number(m[1]), przed: Number(m[2]), po: Number(m[3]), zostalo: Number(m[4]) } : null;
}

function bladZLogu(log: string | null): string {
  const p = '[obrazy] BŁĄD: ';
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith(p));
  return l ? l.slice(p.length).slice(0, 300) : 'Optymalizacja nie powiodła się. Napisz do nas — sprawdzimy to.';
}
