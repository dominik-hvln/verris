import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from '../servers/directadmin.service';

/**
 * PB-19 — widok strony: technologia, ruch 7 dni (żądania, odwiedzający = unikalne IP), błędy 5xx
 * i mediana TTFB mierzona z serwera (`ops/scripts/node-site-stats.sh`, zadanie SITE_STATS).
 * Brak danych to „—”, nie zero: wynik niesie flagę `log` (czy log domeny w ogóle był).
 */
export type StatystykiStrony = {
  technologia: { nazwa: string; wersja: string | null };
  ruch: { dzien: string; zadania: number; odwiedzajacy: number; bledy5xx: number }[];
  top5xx: { sciezka: string; liczba: number }[];
  ttfbMs: { mediana: number; probki: number } | null;
  log: boolean;
};

@Injectable()
export class SiteStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async status(subscriptionId: string, userId: string, domain: string) {
    const { account, domena } = await this.wymagaj(subscriptionId, userId, domain);
    return this.opis(account.id, domena);
  }

  async odswiez(subscriptionId: string, userId: string, domain: string) {
    const { account, domena } = await this.wymagaj(subscriptionId, userId, domain);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.SITE_STATS, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] }, payload: { path: ['domain'], equals: domena } },
    });
    if (wToku) throw new ConflictException('Odczyt jest już w toku — wynik za chwilę.');
    await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.SITE_STATS,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { daUser: account.daUsername, domain: domena },
      },
    });
    return this.opis(account.id, domena);
  }

  private async opis(accountId: string, domena: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.SITE_STATS, payload: { path: ['domain'], equals: domena } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const udane = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED && statystykiZLogu(z.outputLog));
    return {
      domena,
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      odczytano: udane ? (udane.completedAt ?? udane.createdAt).toISOString() : null,
      statystyki: udane ? statystykiZLogu(udane.outputLog) : null,
      blad: zadania[0]?.status === NodeTaskStatus.FAILED ? 'Nie udało się odczytać statystyk strony. Spróbuj ponownie za chwilę.' : null,
    };
  }

  private async wymagaj(subscriptionId: string, userId: string, domain: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, domain);
    return { account: sub.account, domena };
  }
}

const liczba = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const napis = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

export function statystykiZLogu(log: string | null): StatystykiStrony | null {
  const m = /^VERRIS_SITESTATS=([A-Za-z0-9+/=]+)\s*$/m.exec(log ?? '');
  if (!m) return null;
  try {
    const j = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as Record<string, unknown>;
    const t = (j.technologia ?? {}) as Record<string, unknown>;
    const ttfb = j.ttfbMs as Record<string, unknown> | null;
    return {
      technologia: { nazwa: napis(t.nazwa, 40) || 'nieznana', wersja: napis(t.wersja, 20) || null },
      ruch: (Array.isArray(j.ruch) ? j.ruch : []).slice(0, 7).map((d: Record<string, unknown>) => ({
        dzien: /^\d{4}-\d{2}-\d{2}$/.test(String(d.dzien)) ? String(d.dzien) : '',
        zadania: liczba(d.zadania),
        odwiedzajacy: liczba(d.odwiedzajacy),
        bledy5xx: liczba(d.bledy5xx),
      })),
      top5xx: (Array.isArray(j.top5xx) ? j.top5xx : []).slice(0, 5).map((x: Record<string, unknown>) => ({ sciezka: napis(x.sciezka, 200), liczba: liczba(x.liczba) })),
      ttfbMs: ttfb && liczba(ttfb.probki) ? { mediana: liczba(ttfb.mediana), probki: liczba(ttfb.probki) } : null,
      log: j.log !== false,
    };
  } catch {
    return null;
  }
}
