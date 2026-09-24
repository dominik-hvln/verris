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
import { DirectAdminService } from '../servers/directadmin.service';

/**
 * D-12 — eksport i import bazy z panelu klienta. DirectAdmin nie ma na to udokumentowanego API,
 * więc całą pracę robi węzeł przez zadanie `DB_TRANSFER` (`ops/scripts/node-db-transfer.sh`):
 *
 *   export → ~/verris-bazy/<baza>-<czas>.sql.gz (plik zapisuje KLIENT, nie root)
 *   import ← ~/verris-bazy/<plik>.sql[.gz], najpierw automatyczna kopia bazy, potem import
 *            tymczasowym użytkownikiem MySQL z uprawnieniami tylko do tej bazy
 *
 * Plik do importu klient wgrywa menedżerem plików albo FTP do katalogu `verris-bazy`;
 * wynik eksportu pobiera stąd samo.
 */
export const KATALOG_BAZ = 'verris-bazy';
const PLIK_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.sql(\.gz)?$/;

type Zadanie = {
  id: string;
  status: NodeTaskStatus;
  payload: unknown;
  outputLog: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

@Injectable()
export class DbTransferService {
  private readonly logger = new Logger(DbTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async status(subscriptionId: string, userId: string) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    return this.opis(subscriptionId, userId, sub.account.id);
  }

  async zlecEksport(subscriptionId: string, userId: string, db: string) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    const baza = this.sprawdzBaze(sub.account.daUsername, db);
    const task = await this.zlec(sub.account, userId, { mode: 'export', db: baza });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_EXPORT_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, db: baza, taskId: task.id },
    });
    return this.opis(subscriptionId, userId, sub.account.id);
  }

  async zlecImport(subscriptionId: string, userId: string, db: string, file: string) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    const baza = this.sprawdzBaze(sub.account.daUsername, db);
    const plik = (file ?? '').trim();
    if (!PLIK_RE.test(plik)) {
      throw new BadRequestException(`Wybierz plik .sql albo .sql.gz z katalogu ${KATALOG_BAZ}.`);
    }
    const task = await this.zlec(sub.account, userId, { mode: 'import', db: baza, file: plik });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_IMPORT_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, db: baza, file: plik, taskId: task.id },
    });
    return this.opis(subscriptionId, userId, sub.account.id);
  }

  /** Nazwa bazy z panelu jest pełna (login_nazwa); prefiks musi być loginem TEGO konta. */
  private sprawdzBaze(daUsername: string | null, db: string): string {
    const baza = (db ?? '').trim();
    if (!daUsername || !new RegExp(`^${daUsername}_[A-Za-z0-9_]{1,48}$`).test(baza)) {
      throw new BadRequestException('Ta baza nie należy do tej usługi.');
    }
    return baza;
  }

  private async zlec(
    account: { id: string; serverId: string; status: string; daUsername: string | null },
    actorUserId: string,
    payload: { mode: 'export' | 'import'; db: string; file?: string },
  ) {
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.DB_TRANSFER, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Eksport albo import bazy jest już w toku — poczekaj na wynik.');
    return this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.DB_TRANSFER,
        status: NodeTaskStatus.QUEUED,
        requestedById: actorUserId,
        // `daUser` z rekordu konta, nigdy z wejścia klienta.
        payload: { ...payload, daUser: account.daUsername },
      },
    });
  }

  private async opis(subscriptionId: string, userId: string, accountId: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.DB_TRANSFER },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const pliki = await this.directAdmin.listHostingDbTransferFiles(subscriptionId, userId, KATALOG_BAZ);
    return {
      katalog: KATALOG_BAZ,
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      zadania: zadania.map((z) => this.widok(z)),
      ...pliki,
    };
  }

  private widok(z: Zadanie) {
    const p = (z.payload ?? {}) as { mode?: string; db?: string; file?: string };
    return {
      id: z.id,
      tryb: p.mode === 'import' ? ('import' as const) : ('export' as const),
      baza: p.db ?? null,
      plik: p.file ?? null,
      status: z.status,
      utworzone: z.createdAt.toISOString(),
      zakonczone: z.completedAt?.toISOString() ?? null,
      /** Eksport: plik z bazą. Import: kopia sprzed importu (do przywrócenia). */
      wynik: wynikZLogu(z.outputLog),
      blad: z.status === NodeTaskStatus.FAILED ? bladDlaKlienta(z.outputLog, z.errorMessage) : null,
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { ...sub, account: sub.account };
  }
}

/** Ostatnia ścieżka `VERRIS_WYNIK_PLIK=` z logu zadania (tylko w katalogu baz). */
export function wynikZLogu(log: string | null): string | null {
  const trafienia = (log ?? '').split('\n').map((l) => /^VERRIS_WYNIK_PLIK=(verris-bazy\/[A-Za-z0-9._-]+\.sql\.gz)\s*$/.exec(l.trim())?.[1]).filter(Boolean);
  return (trafienia.at(-1) as string | undefined) ?? null;
}

/**
 * Klient dostaje zrozumiały powód: komunikat skryptu („BŁĄD: …”) albo błąd MySQL z pliku
 * (np. „Access denied … to database 'inna'” gdy plik próbuje wejść do cudzej bazy). Bez ścieżek systemu.
 */
export function bladDlaKlienta(log: string | null, errorMessage: string | null): string {
  const linie = (log ?? '').split('\n').map((l) => l.trim());
  const skrypt = [...linie].reverse().find((l) => l.startsWith('[db-transfer] BŁĄD: '));
  const mysql = [...linie].reverse().find((l) => /^ERROR \d+ \(\w+\)/.test(l));
  const tekst = mysql && skrypt?.includes('import przerwany') ? `${skrypt.slice('[db-transfer] BŁĄD: '.length)} Powód: ${mysql}` : skrypt?.slice('[db-transfer] BŁĄD: '.length) ?? mysql;
  if (tekst) return tekst.replace(/\/home\/[a-z0-9]+\//g, '~/').slice(0, 500);
  return errorMessage ? 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.' : 'Operacja nie powiodła się.';
}
