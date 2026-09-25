import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';

/**
 * D-15 / J-03 — Redis konta: osobna instancja na konto, tylko gniazdo w katalogu konta
 * (`ops/scripts/node-redis.sh`, zadanie REDIS_ACCESS). Konfigurację trzyma root, klient nie zmieni
 * limitu pamięci. WordPress podłącza się osobno (WpUpdateService.cache 'redis-on').
 * ponytail: jeden limit dla wszystkich planów; per plan — gdy pojawi się drugi plan hostingu.
 */
export const PAMIEC_REDIS_MB = 64;

/** D-16 — Memcached tym samym torem (`ops/scripts/node-memcached.sh`, zadanie MEMCACHED_ACCESS). */
export type Silnik = 'redis' | 'memcached';
const SILNIK = {
  redis: {
    kind: NodeTaskKind.REDIS_ACCESS,
    wlacz: HostingResourceActions.HOSTING_REDIS_ENABLE_QUEUED,
    wylacz: HostingResourceActions.HOSTING_REDIS_DISABLE_QUEUED,
    nazwa: 'Redisa',
  },
  memcached: {
    kind: NodeTaskKind.MEMCACHED_ACCESS,
    wlacz: HostingResourceActions.HOSTING_MEMCACHED_ENABLE_QUEUED,
    wylacz: HostingResourceActions.HOSTING_MEMCACHED_DISABLE_QUEUED,
    nazwa: 'Memcached',
  },
} as const;

@Injectable()
export class RedisAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status(subscriptionId: string, userId: string, silnik: Silnik = 'redis') {
    const { account } = await this.wymagajKonta(subscriptionId, userId);
    return this.opis(account.id, silnik);
  }

  async przelacz(subscriptionId: string, userId: string, wlacz: boolean, silnik: Silnik = 'redis') {
    const S = SILNIK[silnik];
    const { sub, account } = await this.wymagajKonta(subscriptionId, userId);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: S.kind, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException(`Zmiana ${S.nazwa} jest już w toku — poczekaj na wynik.`);
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: S.kind,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { mode: wlacz ? 'enable' : 'disable', daUser: account.daUsername, memoryMb: String(PAMIEC_REDIS_MB) },
      },
    });
    await this.audit.record({
      action: wlacz ? S.wlacz : S.wylacz,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, taskId: task.id },
    });
    return this.opis(account.id, silnik);
  }

  private async opis(accountId: string, silnik: Silnik = 'redis') {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: SILNIK[silnik].kind },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const tryb = (z: (typeof zadania)[number]) => (z.payload as { mode?: string } | null)?.mode;
    const udane = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED) ?? null;
    const wlaczony = udane ? tryb(udane) === 'enable' : false;
    const ostatnie = zadania[0] ?? null;
    return {
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      wlaczony,
      gniazdo: wlaczony ? gniazdoZLogu(udane?.outputLog ?? null, silnik) : null,
      pamiecMb: PAMIEC_REDIS_MB,
      blad: ostatnie?.status === NodeTaskStatus.FAILED ? bladZLogu(ostatnie.outputLog, silnik) : null,
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { sub, account: sub.account };
  }
}

export function gniazdoZLogu(log: string | null, silnik: Silnik = 'redis'): string | null {
  const re =
    silnik === 'redis'
      ? /^VERRIS_REDIS_SOCKET=(\/home\/[a-z][a-z0-9]{0,15}\/\.verris-redis\/redis\.sock)\s*$/m
      : /^VERRIS_MEMCACHED_SOCKET=(\/home\/[a-z][a-z0-9]{0,15}\/\.verris-memcached\/memcached\.sock)\s*$/m;
  return re.exec(log ?? '')?.[1] ?? null;
}

function bladZLogu(log: string | null, silnik: Silnik = 'redis'): string {
  const p = `[${silnik}] BŁĄD: `;
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith(p));
  return l ? l.slice(p.length).slice(0, 300) : 'Zmiana nie powiodła się. Napisz do nas — sprawdzimy to.';
}
