import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';

/**
 * B-06 (odczyt do B-04) — konfiguracja PHP strony tak, jak widzi ją serwer WWW
 * (`ops/scripts/node-php-info.sh`, zadanie PHP_INFO): wersja, SAPI, najważniejsze dyrektywy
 * i załadowane rozszerzenia. Tylko odczyt — bez wpisu w dzienniku.
 */
export type RozszerzenieSelektora = { nazwa: string; stan: 'on' | 'off' | 'wbudowane' };
export type KonfiguracjaPhp = {
  wersja: string;
  sapi: string;
  ini: Record<string, string | null>;
  rozszerzenia: string[];
  /** B-04 — CloudLinux PHP Selector konta (null: brak selektora na węźle albo PHP natywne). */
  selektor: { wersja: string; rozszerzenia: RozszerzenieSelektora[] } | null;
};

@Injectable()
export class PhpInfoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async status(subscriptionId: string, userId: string, domain: string) {
    const account = await this.wymagajKonta(subscriptionId, userId);
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, domain);
    return this.opis(account.id, domena);
  }

  async sprawdz(subscriptionId: string, userId: string, domain: string) {
    const account = await this.wymagajKonta(subscriptionId, userId);
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, domain);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.PHP_INFO, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Odczyt konfiguracji PHP już trwa.');
    await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.PHP_INFO,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { daUser: account.daUsername, domain: domena },
      },
    });
    return this.opis(account.id, domena);
  }

  private async opis(accountId: string, domena: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.PHP_INFO, payload: { path: ['domain'], equals: domena } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const udane = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED && konfiguracjaZLogu(z.outputLog));
    const ostatnie = zadania[0] ?? null;
    return {
      domena,
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      konfiguracja: udane ? konfiguracjaZLogu(udane.outputLog) : null,
      odczytano: udane ? (udane.completedAt ?? udane.createdAt).toISOString() : null,
      blad: ostatnie?.status === NodeTaskStatus.FAILED ? bladZLogu(ostatnie.outputLog) : null,
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return sub.account;
  }
}

export function konfiguracjaZLogu(log: string | null): KonfiguracjaPhp | null {
  const m = /^VERRIS_PHPINFO=([A-Za-z0-9+/=]+)\s*$/m.exec(log ?? '');
  if (!m) return null;
  try {
    const j = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as Record<string, unknown>;
    if (typeof j.wersja !== 'string') return null;
    const ini: Record<string, string | null> = {};
    if (j.ini && typeof j.ini === 'object') {
      for (const [k, v] of Object.entries(j.ini as Record<string, unknown>)) ini[k] = typeof v === 'string' ? v : null;
    }
    return {
      wersja: j.wersja,
      sapi: typeof j.sapi === 'string' ? j.sapi : '',
      ini,
      rozszerzenia: Array.isArray(j.rozszerzenia) ? j.rozszerzenia.filter((x): x is string => typeof x === 'string') : [],
      selektor: selektorZJson(j.selektor),
    };
  } catch {
    return null;
  }
}

function selektorZJson(v: unknown): KonfiguracjaPhp['selektor'] {
  const o = v as { wersja?: unknown; rozszerzenia?: unknown } | null;
  if (!o || typeof o.wersja !== 'string' || !/^\d+\.\d+$/.test(o.wersja) || !Array.isArray(o.rozszerzenia)) return null;
  const rozszerzenia = o.rozszerzenia.filter(
    (r): r is RozszerzenieSelektora =>
      !!r && typeof (r as RozszerzenieSelektora).nazwa === 'string' && ['on', 'off', 'wbudowane'].includes((r as RozszerzenieSelektora).stan),
  );
  return { wersja: o.wersja, rozszerzenia };
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[php-info] BŁĄD: '));
  return l ? l.slice('[php-info] BŁĄD: '.length).slice(0, 300) : 'Odczyt nie powiódł się. Napisz do nas — sprawdzimy to.';
}
