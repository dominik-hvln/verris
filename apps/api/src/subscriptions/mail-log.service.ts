import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';

/**
 * E-19 — dziennik dostarczania poczty („gdzie jest mój mail”). Węzeł (zadanie MAIL_LOG,
 * `ops/scripts/node-mail-log.sh`) czyta log exima i zwraca wyłącznie wiadomości, w których
 * nadawca albo odbiorca jest w domenach tej usługi — listę domen podaje API, nie klient.
 */
export type WpisPoczty = { czas: string; id: string; znak: '<=' | '=>' | '->' | '**' | '=='; adres: string; szczegoly: string };

@Injectable()
export class MailLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async status(subscriptionId: string, userId: string) {
    const { account } = await this.wymagajKonta(subscriptionId, userId);
    return this.opis(account.id);
  }

  async zlec(subscriptionId: string, userId: string, address?: string) {
    const { account } = await this.wymagajKonta(subscriptionId, userId);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.MAIL_LOG, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Dziennik już się wczytuje — chwila.');
    const { domains } = await this.directAdmin.listHostingDomainsForSubscription(subscriptionId, userId);
    const domeny = [...new Set(domains.map((d) => d.name.toLowerCase()))].slice(0, 200);
    if (!domeny.length) throw new BadRequestException('Usługa nie ma jeszcze domen.');
    await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.MAIL_LOG,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { domains: domeny.join(','), address: (address ?? '').trim().toLowerCase() },
      },
    });
    return this.opis(account.id);
  }

  private async opis(accountId: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.MAIL_LOG },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    const wynik = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED) ?? null;
    const ostatnie = zadania[0] ?? null;
    return {
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      wczytano: wynik ? (wynik.completedAt ?? wynik.createdAt).toISOString() : null,
      adres: wynik ? ((wynik.payload as { address?: string } | null)?.address || null) : null,
      wpisy: wpisyPocztyZLogu(wynik?.outputLog ?? null),
      blad: ostatnie?.status === NodeTaskStatus.FAILED ? bladZLogu(ostatnie.outputLog) : null,
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { sub, account: sub.account };
  }
}

export function wpisyPocztyZLogu(log: string | null): WpisPoczty[] {
  const out: WpisPoczty[] = [];
  for (const l of (log ?? '').split('\n')) {
    const m = /^VERRIS_ML ([\d-]+ [\d:]+)\|([A-Za-z0-9-]{6,30})\|(<=|=>|->|\*\*|==)\|([^|]{1,254})\|(.*)$/.exec(l);
    if (m && out.length < 300) out.push({ czas: m[1], id: m[2], znak: m[3] as WpisPoczty['znak'], adres: m[4], szczegoly: m[5].slice(0, 300) });
  }
  return out;
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[mail-log] BŁĄD: '));
  return l ? l.slice('[mail-log] BŁĄD: '.length).slice(0, 300) : 'Nie udało się wczytać dziennika. Spróbuj ponownie za chwilę.';
}
