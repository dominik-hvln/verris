import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';

/**
 * S-1 — self-restore konta z kopii OFF-SITE w panelu klienta.
 *
 * Kopia off-site leży na niezależnym storage (rclone crypt), do którego panel
 * nie ma i nie może mieć kluczy — całą pracę wykonuje węzeł przez zadanie
 * `OFFSITE_RESTORE` (`ops/scripts/node-account-restore.sh`):
 *
 *   mode=list   → wypisuje archiwa dostępne dla konta (bieżące lub wersja z dnia)
 *   mode=fetch  → ściąga wybrane archiwum do /home/<user>/backups
 *
 * Po `fetch` archiwum pojawia się na zwykłej liście kopii DirectAdmin, więc samo
 * odtworzenie idzie istniejącą, przetestowaną ścieżką `HostingRestoreService`
 * (kopia bezpieczeństwa + potwierdzenie domeny). Dzięki temu nie duplikujemy
 * logiki restore ani nie omijamy potwierdzenia przy operacji niszczącej.
 */

/** Nazwa archiwum: bez ścieżek, bez `..`, tylko rozszerzenia backupów DA. */
const ARCHIVE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}\.(tar\.gz|tar\.zst|tar)$/;
const SNAPSHOT_RE = /^\d{8}$/;

export type OffsiteArchive = {
  name: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
};

@Injectable()
export class OffsiteRestoreService {
  private readonly logger = new Logger(OffsiteRestoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Stan ochrony off-site + wynik ostatniego listowania i ostatniego pobrania. */
  async status(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    return this.describe(sub.account!.id);
  }

  /** Zleca węzłowi wypisanie archiwów off-site dla konta. */
  async queueList(subscriptionId: string, userId: string, snapshot?: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const snap = this.normalizeSnapshot(snapshot);
    const task = await this.queueTask(sub.account!.id, userId, { mode: 'list', snapshot: snap });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_OFFSITE_LIST_QUEUED,
      userId: sub.userId,
      actorUserId: userId,
      details: { accountId: sub.account!.id, snapshot: snap ?? null, taskId: task.id },
    });
    return this.describe(sub.account!.id);
  }

  /** Zleca węzłowi ściągnięcie wybranego archiwum off-site na dysk konta. */
  async queueFetch(subscriptionId: string, userId: string, archive: string, snapshot?: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const name = (archive ?? '').trim();
    if (!ARCHIVE_RE.test(name) || name.includes('/') || name.includes('..')) {
      throw new BadRequestException('Nieprawidłowa nazwa archiwum.');
    }
    const snap = this.normalizeSnapshot(snapshot);
    const task = await this.queueTask(sub.account!.id, userId, {
      mode: 'fetch',
      archive: name,
      snapshot: snap,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_OFFSITE_FETCH_QUEUED,
      userId: sub.userId,
      actorUserId: userId,
      details: { accountId: sub.account!.id, archive: name, snapshot: snap ?? null, taskId: task.id },
    });
    this.logger.log(`Off-site fetch ${name} dla konta ${sub.account!.id} (task=${task.id})`);
    return this.describe(sub.account!.id);
  }

  private async queueTask(
    accountId: string,
    actorUserId: string,
    input: { mode: 'list' | 'fetch'; archive?: string; snapshot?: string },
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { server: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    }
    if (!account.daUsername) {
      throw new BadRequestException('Konto nie ma jeszcze użytkownika DirectAdmin.');
    }
    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        accountId,
        kind: NodeTaskKind.OFFSITE_RESTORE,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) {
      throw new ConflictException('Operacja na kopii off-site jest już w toku — poczekaj na wynik.');
    }

    // `daUser` bierzemy z rekordu konta, nigdy z wejścia klienta.
    const payload: Record<string, string> = { mode: input.mode, daUser: account.daUsername };
    if (input.archive) payload.archive = input.archive;
    if (input.snapshot) payload.snapshot = input.snapshot;

    return this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId,
        kind: NodeTaskKind.OFFSITE_RESTORE,
        status: NodeTaskStatus.QUEUED,
        requestedById: actorUserId,
        payload,
      },
    });
  }

  private async describe(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { server: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const tasks = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.OFFSITE_RESTORE },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const modeOf = (task: (typeof tasks)[number]) =>
      ((task.payload as { mode?: string } | null)?.mode ?? 'list') as 'list' | 'fetch';
    const lastList = tasks.find((task) => modeOf(task) === 'list') ?? null;
    const lastFetch = tasks.find((task) => modeOf(task) === 'fetch') ?? null;
    const busy = tasks.some(
      (task) => task.status === NodeTaskStatus.QUEUED || task.status === NodeTaskStatus.RUNNING,
    );

    const listedAt =
      lastList?.status === NodeTaskStatus.COMPLETED
        ? (lastList.completedAt ?? lastList.updatedAt).toISOString()
        : null;

    return {
      accountId: account.id,
      domain: account.domain,
      offsite: {
        protected: Boolean(account.server?.lastOffsiteBackupOk),
        lastRunAt: account.server?.lastOffsiteBackupAt?.toISOString() ?? null,
      },
      busy,
      snapshot: (lastList?.payload as { snapshot?: string } | null)?.snapshot ?? null,
      listedAt,
      archives:
        lastList?.status === NodeTaskStatus.COMPLETED
          ? this.parseArchives(lastList.outputLog ?? '')
          : [],
      lastList: this.taskView(lastList),
      lastFetch: this.taskView(lastFetch),
      fetchedArchive:
        lastFetch?.status === NodeTaskStatus.COMPLETED
          ? ((lastFetch.payload as { archive?: string } | null)?.archive ?? null)
          : null,
    };
  }

  private taskView(task: { id: string; status: NodeTaskStatus; errorMessage: string | null; createdAt: Date; completedAt: Date | null; payload: unknown } | null) {
    if (!task) return null;
    return {
      id: task.id,
      status: task.status,
      mode: ((task.payload as { mode?: string } | null)?.mode ?? 'list') as 'list' | 'fetch',
      // Klient dostaje komunikat po ludzku; surowy log zostaje w NodeTask dla staffu.
      errorMessage:
        task.status === NodeTaskStatus.FAILED ? this.friendlyError(task.errorMessage) : null,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
    };
  }

  /**
   * Log z węzła bywa techniczny (ścieżki, nazwy plików konfiguracyjnych) — do
   * panelu klienta wypuszczamy tylko zrozumiały komunikat i wskazówkę co dalej.
   */
  private friendlyError(raw: string | null): string {
    const text = (raw ?? '').toLowerCase();
    if (!text) return 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';
    if (text.includes('verris-backup.conf') || text.includes('rclone_remote') || text.includes('rclone nie zainstalowany')) {
      return 'Kopia off-site nie jest jeszcze skonfigurowana dla tego serwera. Napisz do nas.';
    }
    if (text.includes('brak katalogu')) {
      return 'Nie znaleźliśmy katalogu kopii na koncie. Napisz do nas — pomożemy.';
    }
    if (text.includes('rclone copy')) {
      return 'Nie udało się pobrać archiwum z magazynu off-site. Spróbuj ponownie za chwilę.';
    }
    if (text.includes('nieprawidlow')) {
      return 'Nieprawidłowe dane operacji. Odśwież listę kopii i spróbuj ponownie.';
    }
    return 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';
  }

  /**
   * Log zadania zawiera wiersze `VERRIS-OFFSITE-FILE <nazwa>|<bajty>|<data>`
   * wypisane przez skrypt na węźle (reszta logu to zwykłe komunikaty).
   */
  private parseArchives(outputLog: string): OffsiteArchive[] {
    const out: OffsiteArchive[] = [];
    for (const rawLine of outputLog.split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('VERRIS-OFFSITE-FILE ')) continue;
      const [name, size, modified] = line.slice('VERRIS-OFFSITE-FILE '.length).split('|');
      const fileName = (name ?? '').trim();
      if (!fileName || !ARCHIVE_RE.test(fileName)) continue;
      const bytes = Number.parseInt((size ?? '').trim(), 10);
      const when = (modified ?? '').trim();
      const parsed = when ? new Date(when.replace(' ', 'T')) : null;
      out.push({
        name: fileName,
        sizeBytes: Number.isFinite(bytes) ? bytes : null,
        modifiedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      });
    }
    // Najnowsze u góry — klient prawie zawsze chce ostatnią kopię.
    return out.sort((a, b) => (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? ''));
  }

  private normalizeSnapshot(snapshot?: string): string | undefined {
    const value = (snapshot ?? '').trim();
    if (!value) return undefined;
    if (!SNAPSHOT_RE.test(value)) {
      throw new BadRequestException('Nieprawidłowa wersja kopii (oczekiwano RRRRMMDD).');
    }
    return value;
  }

  private async requireOwnedSub(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return sub;
  }
}
