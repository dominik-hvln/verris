import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

/**
 * C-15 / K-03 — co zajmuje miejsce na koncie i ile jest plików (i-węzłów), dwa poziomy katalogów.
 * Liczy węzeł (zadanie DISK_USAGE, `ops/scripts/node-disk-usage.sh`) jako klient; wynik zostaje
 * w logu zadania — panel pokazuje ostatni pomiar i jego datę.
 */
export type WpisZajetosci = { sciezka: string; kb: number; pliki: number | null };

@Injectable()
export class DiskUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async status(subscriptionId: string, userId: string) {
    const account = await this.wymagajKonta(subscriptionId, userId);
    return this.opis(account.id);
  }

  async policz(subscriptionId: string, userId: string) {
    const account = await this.wymagajKonta(subscriptionId, userId);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.DISK_USAGE, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Liczenie już trwa — wynik za chwilę.');
    await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.DISK_USAGE,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { daUser: account.daUsername },
      },
    });
    return this.opis(account.id);
  }

  private async opis(accountId: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.DISK_USAGE },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const wynik = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED) ?? null;
    const ostatnie = zadania[0] ?? null;
    return {
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      policzono: wynik ? (wynik.completedAt ?? wynik.createdAt).toISOString() : null,
      ...zajetoscZLogu(wynik?.outputLog ?? null),
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

const liczba = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);

export function zajetoscZLogu(log: string | null): {
  razem: { kb: number; pliki: number | null } | null;
  wpisy: WpisZajetosci[];
  skrzynki: { email: string; kb: number }[];
} {
  let razem: { kb: number; pliki: number | null } | null = null;
  const wpisy: WpisZajetosci[] = [];
  const skrzynki: { email: string; kb: number }[] = [];
  for (const l of (log ?? '').split('\n')) {
    const r = /^VERRIS_DU_RAZEM (\d+)\|(-?\d+)\s*$/.exec(l);
    if (r) razem = { kb: Number(r[1]), pliki: liczba(r[2]) };
    const m = /^VERRIS_DU (\d+)\|(-?\d+)\|(.+)$/.exec(l);
    if (m && wpisy.length < 80) wpisy.push({ kb: Number(m[1]), pliki: liczba(m[2]), sciezka: m[3] });
    // E-06 — zajętość skrzynek (~/imap/<domena>/<login>)
    const s = /^VERRIS_DU_SKRZYNKA (\d+)\|([a-z0-9.-]{3,253})\|([^|@\s]{1,64})\s*$/i.exec(l);
    if (s && skrzynki.length < 2000) skrzynki.push({ email: `${s[3]}@${s[2]}`.toLowerCase(), kb: Number(s[1]) });
  }
  return { razem, wpisy, skrzynki };
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[disk-usage] BŁĄD: '));
  return l ? l.slice('[disk-usage] BŁĄD: '.length).slice(0, 300) : 'Liczenie nie powiodło się. Spróbuj ponownie za chwilę.';
}
