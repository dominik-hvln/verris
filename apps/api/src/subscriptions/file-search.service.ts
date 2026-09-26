import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';

/**
 * C-14 — wyszukiwanie plików w katalogu strony po fragmencie nazwy i/lub tekście w treści
 * (`ops/scripts/node-file-search.sh`, zadanie FILE_SEARCH, szuka klient). Tylko odczyt.
 */
export type WynikWyszukiwania = { pliki: { p: string; s: number; t: number }[]; ucieto: boolean };

export function sprawdzZapytanie(name: string, text: string): { name: string; text: string } {
  const n = (name ?? '').trim();
  const t = (text ?? '').trim();
  if (!n && !t) throw new BadRequestException('Podaj fragment nazwy pliku albo tekst do znalezienia.');
  if (n.length > 100 || /[*?[\]/\n]/.test(n)) throw new BadRequestException('Nazwa: do 100 znaków, bez * ? [ ] /.');
  if (t.length > 200 || t.includes('\n')) throw new BadRequestException('Tekst: do 200 znaków w jednej linii.');
  return { name: n, text: t };
}

@Injectable()
export class FileSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async status(subscriptionId: string, userId: string, domain: string) {
    const account = await this.wymagajKonta(subscriptionId, userId);
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, domain);
    return this.opis(account.id, domena);
  }

  async szukaj(subscriptionId: string, userId: string, input: { domain: string; name: string; text: string }) {
    const q = sprawdzZapytanie(input.name, input.text);
    const account = await this.wymagajKonta(subscriptionId, userId);
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, input.domain);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.FILE_SEARCH, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Wyszukiwanie już trwa — poczekaj na wynik.');
    await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.FILE_SEARCH,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { daUser: account.daUsername, domain: domena, name: q.name, text: q.text },
      },
    });
    return this.opis(account.id, domena);
  }

  private async opis(accountId: string, domena: string) {
    const z = await this.prisma.nodeTask.findFirst({
      where: { accountId, kind: NodeTaskKind.FILE_SEARCH, payload: { path: ['domain'], equals: domena } },
      orderBy: { createdAt: 'desc' },
    });
    const p = (z?.payload ?? {}) as { name?: string; text?: string };
    return {
      domena,
      wToku: z ? z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING : false,
      zapytanie: z ? { name: p.name ?? '', text: p.text ?? '' } : null,
      wynik: z?.status === NodeTaskStatus.COMPLETED ? wynikZLogu(z.outputLog) : null,
      blad: z?.status === NodeTaskStatus.FAILED ? bladZLogu(z.outputLog) : null,
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return sub.account;
  }
}

export function wynikZLogu(log: string | null): WynikWyszukiwania | null {
  const m = /^VERRIS_SZUKAJ=([A-Za-z0-9+/=]+)\s*$/m.exec(log ?? '');
  if (!m) return null;
  try {
    const j = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as { pliki?: unknown; ucieto?: unknown };
    const pliki = Array.isArray(j.pliki)
      ? j.pliki
          .filter((x): x is { p: string; s: number; t: number } => !!x && typeof (x as { p?: unknown }).p === 'string')
          .map((x) => ({ p: x.p, s: Number(x.s) || 0, t: Number(x.t) || 0 }))
      : [];
    return { pliki, ucieto: j.ucieto === true };
  } catch {
    return null;
  }
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[file-search] BŁĄD: '));
  return l ? l.slice('[file-search] BŁĄD: '.length).slice(0, 300) : 'Wyszukiwanie nie powiodło się. Napisz do nas — sprawdzimy to.';
}
