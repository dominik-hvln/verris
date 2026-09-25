import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

/**
 * K-14 — wolne zapytania SQL baz konta (`ops/scripts/node-slow-sql.sh`, zadanie SLOW_SQL). Węzeł czyta
 * slow query log MariaDB i oddaje tylko zapytania użytkowników baz tego konta, znormalizowane
 * (wartości zastąpione „?”) i zgrupowane: liczba, łączny i najdłuższy czas, przejrzane wiersze.
 */
export type GrupaWolnych = { sql: string; baza: string; liczba: number; suma: number; max: number; przejrzane: number; ostatnio: string | null };

@Injectable()
export class SlowSqlService {
  constructor(private readonly prisma: PrismaService) {}

  async status(subscriptionId: string, userId: string) {
    const account = await this.konto(subscriptionId, userId);
    return this.opis(account.id);
  }

  async odswiez(subscriptionId: string, userId: string) {
    const account = await this.konto(subscriptionId, userId);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.SLOW_SQL, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Odczyt jest już w toku — wynik za chwilę.');
    await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.SLOW_SQL,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { daUser: account.daUsername },
      },
    });
    return this.opis(account.id);
  }

  private async opis(accountId: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.SLOW_SQL },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const udane = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED && wynikZLogu(z.outputLog));
    const w = udane ? wynikZLogu(udane.outputLog) : null;
    const ostatnie = zadania[0] ?? null;
    return {
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      odczytano: udane ? (udane.completedAt ?? udane.createdAt).toISOString() : null,
      wlaczony: w?.wlaczony ?? null,
      progSekund: w?.prog ?? null,
      grupy: w?.grupy ?? [],
      blad: ostatnie?.status === NodeTaskStatus.FAILED ? 'Nie udało się odczytać dziennika wolnych zapytań. Spróbuj ponownie za chwilę.' : null,
    };
  }

  private async konto(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return sub.account;
  }
}

export function wynikZLogu(log: string | null): { wlaczony: boolean; prog: number | null; grupy: GrupaWolnych[] } | null {
  const m = /^VERRIS_SLOWSQL=([A-Za-z0-9+/=]+)\s*$/m.exec(log ?? '');
  if (!m) return null;
  try {
    const j = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as { wlaczony?: unknown; prog?: unknown; grupy?: unknown };
    const liczba = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    const prog = Number(j.prog);
    return {
      wlaczony: j.wlaczony === true,
      prog: Number.isFinite(prog) ? prog : null,
      grupy: (Array.isArray(j.grupy) ? j.grupy : []).slice(0, 25).map((g: Record<string, unknown>) => ({
        sql: typeof g.sql === 'string' ? g.sql.slice(0, 1500) : '',
        baza: typeof g.baza === 'string' ? g.baza.slice(0, 64) : '',
        liczba: liczba(g.liczba),
        suma: liczba(g.suma),
        max: liczba(g.max),
        przejrzane: liczba(g.przejrzane),
        ostatnio: liczba(g.ostatnio) ? new Date(liczba(g.ostatnio) * 1000).toISOString() : null,
      })),
    };
  } catch {
    return null;
  }
}
