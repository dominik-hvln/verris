import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus, ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';
import { ARCHIVE_RE, SNAPSHOT_RE, archiwaZLogu } from './offsite-restore.service';

/**
 * H-16 — odtworzenie konta z kopii off-site na INNYM węźle (awaria/utrata węzła źródłowego).
 * Operator (tylko ADMIN) wybiera węzeł docelowy, zadanie OFFSITE_RESTORE idzie na ten węzeł i czyta
 * kopie spod prefiksu węzła źródłowego (`nodes/<hostname -s>` — ten sam układ co node-offsite-backup.sh;
 * cała flota używa tego samego remote crypt). DA odtwarza konto z IP węzła docelowego
 * (ip_choice=select, dokumentacja DA), a po sukcesie NodeTasksService przepina konto na nowy węzeł.
 * DNS domen klienta przełącza się razem z kontem tylko przy zewnętrznym DNS (klaster) — inaczej
 * operator zmienia serwery nazw według checklisty w panelu.
 */
@Injectable()
export class OdtworzenieNaWezleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status(subscriptionId: string) {
    const { account } = await this.konto(subscriptionId);
    const zadania = (
      await this.prisma.nodeTask.findMany({
        where: { accountId: account.id, kind: NodeTaskKind.OFFSITE_RESTORE },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { server: { select: { id: true, name: true, hostname: true } } },
      })
    ).filter((t) => (t.payload as { przeniesienie?: string } | null)?.przeniesienie === '1');
    const tryb = (t: (typeof zadania)[number]) => (t.payload as { mode?: string }).mode;
    const lista = zadania.find((t) => tryb(t) === 'list') ?? null;
    const odtw = zadania.find((t) => tryb(t) === 'restore') ?? null;
    const widok = (t: (typeof zadania)[number] | null) =>
      t && {
        id: t.id,
        status: t.status,
        wezel: t.server?.name ?? t.server?.hostname ?? t.serverId,
        archiwum: (t.payload as { archive?: string }).archive ?? null,
        blad: t.status === NodeTaskStatus.FAILED ? (t.errorMessage ?? t.outputLog ?? '').split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 300) ?? null : null,
        utworzone: t.createdAt.toISOString(),
        zakonczone: t.completedAt?.toISOString() ?? null,
      };
    return {
      wezelZrodlowy: { id: account.serverId, prefiks: prefiks(account.server?.hostname) },
      wToku: zadania.some((t) => t.status === NodeTaskStatus.QUEUED || t.status === NodeTaskStatus.RUNNING),
      lista: widok(lista),
      archiwa: lista?.status === NodeTaskStatus.COMPLETED ? archiwaZLogu(lista.outputLog ?? '') : [],
      odtworzenie: widok(odtw),
    };
  }

  async lista(subscriptionId: string, actorUserId: string, input: { targetServerId: string; snapshot?: string }) {
    return this.zlec(subscriptionId, actorUserId, input.targetServerId, { mode: 'list', snapshot: snapshotLubNic(input.snapshot) });
  }

  async start(subscriptionId: string, actorUserId: string, input: { targetServerId: string; archive: string; snapshot?: string }) {
    const archive = (input.archive ?? '').trim();
    if (!ARCHIVE_RE.test(archive) || archive.includes('..') || archive.includes('/')) throw new BadRequestException('Nieprawidłowa nazwa archiwum.');
    return this.zlec(subscriptionId, actorUserId, input.targetServerId, { mode: 'restore', archive, snapshot: snapshotLubNic(input.snapshot) });
  }

  private async zlec(
    subscriptionId: string,
    actorUserId: string,
    targetServerId: string,
    dane: { mode: 'list' | 'restore'; archive?: string; snapshot?: string },
  ) {
    const { sub, account } = await this.konto(subscriptionId);
    const src = prefiks(account.server?.hostname);
    if (!src) throw new BadRequestException('Węzeł źródłowy nie ma nazwy hosta — nie da się ustalić, gdzie leżą jego kopie off-site.');
    if (targetServerId === account.serverId) throw new BadRequestException('Wybierz inny węzeł niż obecny.');
    const cel = await this.prisma.server.findUnique({ where: { id: targetServerId } });
    if (!cel || cel.status !== ServerStatus.ACTIVE) throw new BadRequestException('Węzeł docelowy musi być aktywny.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.OFFSITE_RESTORE, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Operacja na kopii off-site tego konta jest już w toku.');
    const payload: Record<string, string> = { mode: dane.mode, daUser: account.daUsername, sourcePrefix: src, przeniesienie: '1' };
    if (dane.archive) payload.archive = dane.archive;
    if (dane.snapshot) payload.snapshot = dane.snapshot;
    if (dane.mode === 'restore') payload.ip = cel.ipAddress;
    const task = await this.prisma.nodeTask.create({
      data: { serverId: cel.id, accountId: account.id, kind: NodeTaskKind.OFFSITE_RESTORE, status: NodeTaskStatus.QUEUED, requestedById: actorUserId, payload },
    });
    await this.audit.record({
      action: dane.mode === 'restore' ? HostingResourceActions.ACCOUNT_RESTORE_TO_NODE_QUEUED : HostingResourceActions.HOSTING_OFFSITE_LIST_QUEUED,
      userId: sub.userId,
      actorUserId,
      details: { subscriptionId, accountId: account.id, fromServerId: account.serverId, toServerId: cel.id, ...dane, taskId: task.id },
    });
    return this.status(subscriptionId);
  }

  private async konto(subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId }, include: { account: { include: { server: true } } } });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (!sub.account?.daUsername) throw new BadRequestException('Usługa nie ma konta hostingowego.');
    return { sub, account: sub.account };
  }
}

/** Prefiks kopii węzła: `nodes/$(hostname -s)` — pierwsza etykieta nazwy hosta. */
export function prefiks(hostname: string | null | undefined): string | null {
  const krotka = (hostname ?? '').trim().toLowerCase().split('.')[0];
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(krotka) ? `nodes/${krotka}` : null;
}

function snapshotLubNic(s?: string): string | undefined {
  const v = (s ?? '').trim();
  if (!v) return undefined;
  if (!SNAPSHOT_RE.test(v)) throw new BadRequestException('Nieprawidłowa wersja kopii (RRRRMMDD).');
  return v;
}
