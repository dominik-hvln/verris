import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';

/**
 * H-10 / H-11 — podgląd zawartości archiwum kopii i odtworzenie pojedynczego pliku lub katalogu.
 * Robi to węzeł (zadanie FILE_RESTORE, `ops/scripts/node-file-restore.sh`) jako KLIENT:
 *
 *   list    → wpisy archiwum pod wskazanym prefiksem (najwyżej 2000)
 *   extract → plik/katalog do NOWEGO katalogu ~/verris-odtworzone/<czas>/ — nic na koncie
 *             nie jest nadpisywane; na miejsce przenosi klient menedżerem plików.
 */
const ARCHIWUM_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}\.(tar\.gz|tar\.zst|tar)$/;
const STEROWANIE = /[\u0000-\u001f\u007f]/;

export type WpisArchiwum = { typ: 'f' | 'd' | 'l'; rozmiar: number; sciezka: string };

@Injectable()
export class FileRestoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status(subscriptionId: string, userId: string) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    return this.opis(sub.account.id);
  }

  async zlecListe(subscriptionId: string, userId: string, archive: string, path?: string) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    const archiwum = sprawdzArchiwum(archive);
    const sciezka = sprawdzSciezke(path ?? '', false);
    await this.zlec(sub.account, userId, { mode: 'list', archive: archiwum, path: sciezka });
    return this.opis(sub.account.id);
  }

  async zlecOdtworzenie(subscriptionId: string, userId: string, archive: string, path: string) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    const archiwum = sprawdzArchiwum(archive);
    const sciezka = sprawdzSciezke(path, true);
    const task = await this.zlec(sub.account, userId, { mode: 'extract', archive: archiwum, path: sciezka });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_RESTORE_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, archive: archiwum, path: sciezka, taskId: task.id },
    });
    return this.opis(sub.account.id);
  }

  private async zlec(
    account: { id: string; serverId: string; status: string; daUsername: string | null },
    actorUserId: string,
    payload: { mode: 'list' | 'extract'; archive: string; path: string },
  ) {
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.FILE_RESTORE, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Operacja na archiwum jest już w toku — poczekaj na wynik.');
    return this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.FILE_RESTORE,
        status: NodeTaskStatus.QUEUED,
        requestedById: actorUserId,
        payload: { ...payload, daUser: account.daUsername },
      },
    });
  }

  private async opis(accountId: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.FILE_RESTORE },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const tryb = (z: (typeof zadania)[number]) => (z.payload as { mode?: string } | null)?.mode;
    const lista = zadania.find((z) => tryb(z) === 'list') ?? null;
    const p = (z: (typeof zadania)[number] | null) => (z?.payload ?? {}) as { archive?: string; path?: string };
    return {
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      lista: lista
        ? {
            archiwum: p(lista).archive ?? null,
            prefiks: p(lista).path ?? '',
            status: lista.status,
            ...(lista.status === NodeTaskStatus.COMPLETED ? wpisyZLogu(lista.outputLog) : { wpisy: [], obciete: false }),
            blad: lista.status === NodeTaskStatus.FAILED ? bladZLogu(lista.outputLog) : null,
          }
        : null,
      odtworzenia: zadania
        .filter((z) => tryb(z) === 'extract')
        .map((z) => ({
          id: z.id,
          archiwum: p(z).archive ?? null,
          sciezka: p(z).path ?? null,
          status: z.status,
          utworzone: z.createdAt.toISOString(),
          katalog: z.status === NodeTaskStatus.COMPLETED ? katalogZLogu(z.outputLog) : null,
          blad: z.status === NodeTaskStatus.FAILED ? bladZLogu(z.outputLog) : null,
        })),
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { ...sub, account: sub.account };
  }
}

function sprawdzArchiwum(archive: string): string {
  const a = (archive ?? '').trim();
  if (!ARCHIWUM_RE.test(a)) throw new BadRequestException('Nieprawidłowa nazwa archiwum.');
  return a;
}

/** Ścieżka wewnątrz archiwum: względna, bez „..” i znaków sterujących. */
export function sprawdzSciezke(path: string, wymagana: boolean): string {
  const s = (path ?? '').trim().replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (!s) {
    if (wymagana) throw new BadRequestException('Wskaż plik albo katalog do odtworzenia.');
    return '';
  }
  if (s.startsWith('/') || s.split('/').includes('..') || STEROWANIE.test(s) || s.length > 1024) {
    throw new BadRequestException('Nieprawidłowa ścieżka w archiwum.');
  }
  return s;
}

export function wpisyZLogu(log: string | null): { wpisy: WpisArchiwum[]; obciete: boolean } {
  const wpisy: WpisArchiwum[] = [];
  let obciete = false;
  for (const l of (log ?? '').split('\n')) {
    if (l.startsWith('VERRIS_OBCIETE ')) obciete = true;
    const m = /^VERRIS_WPIS ([fdl])\|(\d+)\|(.+)$/.exec(l);
    if (m) wpisy.push({ typ: m[1] as WpisArchiwum['typ'], rozmiar: Number(m[2]), sciezka: m[3] });
  }
  return { wpisy, obciete };
}

export function katalogZLogu(log: string | null): string | null {
  const m = /^VERRIS_WYNIK_KATALOG=(verris-odtworzone\/[0-9a-f-]+)\s*$/m.exec(log ?? '');
  return m?.[1] ?? null;
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[file-restore] BŁĄD: '));
  return l ? l.slice('[file-restore] BŁĄD: '.length).slice(0, 500) : 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';
}
