import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { HostingResourceActions } from '../common/audit/audit.actions.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { DirectAdminApiError } from '@verris/directadmin-sdk';

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
 *
 * D-18 — to samo zadanie robi naprawę (`repair`: check + auto-repair) i optymalizację tabel.
 */
export const KATALOG_BAZ = 'verris-bazy';
const PLIK_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.sql(\.gz)?$/;
/** Paczka 129 — wgranie pliku do importu prosto z zakładki baz; większe pliki przez FTP (jak w menedżerze plików). */
export const MAX_PLIKU_BAZY = 25_000_000;

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

  /** D-18 — sprawdzenie z naprawą albo optymalizacja tabel jednej bazy (mysqlcheck na węźle). */
  async zlecKonserwacje(subscriptionId: string, userId: string, db: string, mode: 'repair' | 'optimize') {
    if (mode !== 'repair' && mode !== 'optimize') throw new BadRequestException('Nieprawidłowa operacja.');
    const sub = await this.wymagajKonta(subscriptionId, userId);
    const baza = this.sprawdzBaze(sub.account.daUsername, db);
    const task = await this.zlec(sub.account, userId, { mode, db: baza });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_MAINTENANCE_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, db: baza, mode, taskId: task.id },
    });
    return this.opis(subscriptionId, userId, sub.account.id);
  }

  /** D-08 — zestaw uprawnień użytkownika MySQL do bazy konta (GRANT na węźle, wszystkie hosty użytkownika). */
  async zlecUprawnienia(subscriptionId: string, userId: string, db: string, dbUser: string, privs: 'full' | 'rw' | 'ro') {
    if (!['full', 'rw', 'ro'].includes(privs)) throw new BadRequestException('Nieprawidłowy zestaw uprawnień.');
    const sub = await this.wymagajKonta(subscriptionId, userId);
    const baza = this.sprawdzBaze(sub.account.daUsername, db);
    const uzytkownik = this.sprawdzBaze(sub.account.daUsername, dbUser);
    const task = await this.zlec(sub.account, userId, { mode: 'privileges', db: baza, user: uzytkownik, privs });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_PRIVILEGES_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, db: baza, user: uzytkownik, privs, taskId: task.id },
    });
    return this.opis(subscriptionId, userId, sub.account.id);
  }

  /** D-17 — przeliczenie rozmiaru baz konta (information_schema na węźle). Tylko odczyt, bez dziennika. */
  async zlecRozmiary(subscriptionId: string, userId: string) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    await this.zlec(sub.account, userId, { mode: 'sizes', db: '' });
    return this.opis(subscriptionId, userId, sub.account.id);
  }

  /**
   * Paczka 129 — plik .sql/.sql.gz do importu wgrany z zakładki „Bazy danych” do ~/verris-bazy. Ten sam tor co
   * menedżer plików (API serwera hostingu z control-plane, jako użytkownik konta). Bez nadpisywania: plik o tej
   * samej nazwie (np. kopia sprzed importu) zostaje, klient dostaje 409.
   */
  async wgrajPlik(subscriptionId: string, userId: string, nazwa: string | undefined, dane: Buffer | undefined) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    if (sub.account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const plik = (nazwa ?? '').trim();
    if (!PLIK_RE.test(plik)) {
      throw new BadRequestException('Wybierz plik .sql albo .sql.gz – w nazwie tylko litery, cyfry, kropki, myślniki i podkreślenia.');
    }
    if (!dane?.length) throw new BadRequestException('Plik jest pusty.');
    if (dane.length > MAX_PLIKU_BAZY) {
      throw new PayloadTooLargeException(`Plik jest większy niż 25 MB – wgraj go przez FTP do katalogu ${KATALOG_BAZ}.`);
    }
    if (plik.endsWith('.gz') && !(dane[0] === 0x1f && dane[1] === 0x8b)) {
      throw new BadRequestException('Plik .sql.gz nie jest archiwum gzip – sprawdź plik albo wgraj go jako .sql.');
    }
    const client = await this.directAdmin.getClientForHostingAccount(sub.account.id, userId);
    const katalog = `/${KATALOG_BAZ}`;
    let wpisy: { name: string }[] | null = null;
    try {
      wpisy = await client.listDir(katalog);
    } catch (err) {
      // Katalogu nie ma przed pierwszym eksportem — DA odpowiada wtedy błędem (jak w listHostingDbTransferFiles).
      if (!(err instanceof DirectAdminApiError)) throw err;
    }
    if (wpisy === null) await client.makeDir('/', KATALOG_BAZ);
    else if (wpisy.some((w) => w.name === plik)) {
      throw new ConflictException(`W katalogu ${KATALOG_BAZ} jest już plik „${plik}” – zmień nazwę pliku i wgraj go ponownie.`);
    }
    await client.uploadFile(katalog, plik, dane);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_UPLOADED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, accountId: sub.account.id, path: `${katalog}/${plik}`, bytes: dane.length, cel: 'import-bazy' },
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
    payload: { mode: 'export' | 'import' | 'repair' | 'optimize' | 'privileges' | 'sizes'; db: string; file?: string; user?: string; privs?: string },
  ) {
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.DB_TRANSFER, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Inna operacja na bazie jest już w toku – poczekaj na wynik.');
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
    // D-08: ostatni zestaw ustawiony w panelu dla każdej pary baza/użytkownik (bez wpisu = domyślne pełne).
    const nadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.DB_TRANSFER, payload: { path: ['mode'], equals: 'privileges' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    // Nieudana zmiana nie przesłania ostatniego działającego zestawu, ale klient ma ją zobaczyć (test D3 29.09:
    // „Tylko odczyt” padał na węźle, a panel dalej pisał „zmiana w toku”, choć użytkownik miał pełne prawa).
    const uprawnienia: Record<string, { zestaw: string; status: string; nieudana?: string }> = {};
    const nieudane: Record<string, string> = {};
    for (const z of nadania) {
      const p = (z.payload ?? {}) as { db?: string; user?: string; privs?: string };
      const klucz = `${p.db}|${p.user}`;
      if (!p.db || !p.user || !p.privs || uprawnienia[klucz]) continue;
      if (z.status === NodeTaskStatus.FAILED || z.status === NodeTaskStatus.CANCELLED) {
        nieudane[klucz] ??= p.privs;
        continue;
      }
      uprawnienia[klucz] = { zestaw: p.privs, status: z.status };
    }
    for (const [klucz, zestaw] of Object.entries(nieudane)) {
      // Nieudana zmiana NOWSZA niż ostatnia udana (albo brak udanej = domyślne pełne).
      const najnowsza = nadania.find((z) => {
        const p = (z.payload ?? {}) as { db?: string; user?: string };
        return `${p.db}|${p.user}` === klucz;
      });
      if (najnowsza && (najnowsza.status === NodeTaskStatus.FAILED || najnowsza.status === NodeTaskStatus.CANCELLED)) {
        uprawnienia[klucz] = { ...(uprawnienia[klucz] ?? { zestaw: 'full', status: NodeTaskStatus.COMPLETED }), nieudana: zestaw };
      }
    }
    const pomiar = await this.prisma.nodeTask.findFirst({
      where: { accountId, kind: NodeTaskKind.DB_TRANSFER, status: NodeTaskStatus.COMPLETED, payload: { path: ['mode'], equals: 'sizes' } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      uprawnienia,
      rozmiary: pomiar ? { kiedy: (pomiar.completedAt ?? pomiar.createdAt).toISOString(), bazy: rozmiaryZLogu(pomiar.outputLog) } : null,
      katalog: KATALOG_BAZ,
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      zadania: zadania.filter((z) => (z.payload as { mode?: string } | null)?.mode !== 'sizes').map((z) => this.widok(z)),
      ...pliki,
    };
  }

  private widok(z: Zadanie) {
    const p = (z.payload ?? {}) as { mode?: string; db?: string; file?: string; user?: string; privs?: string };
    return {
      uzytkownik: p.user ?? null,
      zestaw: p.privs ?? null,
      id: z.id,
      tryb: p.mode === 'import' || p.mode === 'repair' || p.mode === 'optimize' || p.mode === 'privileges' ? p.mode : ('export' as const),
      baza: p.db ?? null,
      plik: p.file ?? null,
      status: z.status,
      utworzone: z.createdAt.toISOString(),
      zakonczone: z.completedAt?.toISOString() ?? null,
      /** Eksport: plik z bazą. Import: kopia sprzed importu (do przywrócenia). */
      wynik: wynikZLogu(z.outputLog),
      /** D-18: liczba sprawdzonych tabel i uwagi mysqlcheck (np. naprawiona tabela). */
      tabele: Number(/^VERRIS_DB_TABELE=(\d{1,6})\s*$/m.exec(z.outputLog ?? '')?.[1] ?? NaN) || null,
      uwagi: (z.outputLog ?? '').split('\n').flatMap((l) => /^VERRIS_DB_UWAGA=(.{1,300})$/.exec(l.trim())?.[1] ?? []).slice(0, 20),
      blad: z.status === NodeTaskStatus.FAILED ? bladDlaKlienta(z.outputLog, z.errorMessage) : null,
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Nie znaleziono usługi.');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { ...sub, account: sub.account };
  }
}

/** D-17 — `VERRIS_DB_ROZMIAR=<baza>\t<bajty>\t<tabele>` z logu zadania. */
export function rozmiaryZLogu(log: string | null): { baza: string; bajty: number; tabele: number }[] {
  return (log ?? '')
    .split('\n')
    .flatMap((l) => {
      const m = /^VERRIS_DB_ROZMIAR=([A-Za-z0-9_]{1,64})\t(\d{1,15})\t(\d{1,6})\s*$/.exec(l);
      return m ? [{ baza: m[1], bajty: Number(m[2]), tabele: Number(m[3]) }] : [];
    });
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
  return errorMessage ? 'Operacja nie powiodła się. Napisz do nas – sprawdzimy to.' : 'Operacja nie powiodła się.';
}
