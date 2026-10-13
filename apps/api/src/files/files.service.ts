import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { DaFileEntry } from '@verris/directadmin-sdk';
import { PrismaService } from '../prisma/prisma.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { HostingResourceActions } from '../common/audit/audit.actions.js';
import { jestWpisemSystemowym } from './pliki-systemowe-konta.js';

/** Max bytes we will read into the in-panel text editor. */
const MAX_EDIT_BYTES = 1_000_000; // 1 MB
/** Max upload / write size. */
const MAX_WRITE_BYTES = 25_000_000; // 25 MB
/** Max in-panel download size — larger files must go via FTP (memory guard). */
const MAX_DOWNLOAD_BYTES = 100_000_000; // 100 MB
const MAX_ODCZYTOW_NA_KONTO = 2;

/** Ścieżka elementu `n` w katalogu `dir` (oba już po `safePath`/`safeName`). */
const wKatalogu = (dir: string, n: string) => `${dir === '/' ? '' : dir}/${n}`;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly da: DirectAdminService,
    private readonly audit: AuditService,
  ) {}

  // --- account resolution -----------------------------------------------------

  /** Resolves the hosting account behind a subscription, verifying ownership. */
  private async requireAccount(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Usługa nie została znaleziona.');
    if (!sub.account) {
      throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    }
    if (sub.account.status !== 'ACTIVE') {
      throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    }
    return sub.account;
  }

  /** Builds a DA client impersonating the account's DA user. */
  private async clientFor(account: { serverId: string; daUsername: string }) {
    const admin = await this.da.getClientForServer(account.serverId);
    return admin.asUser(account.daUsername);
  }

  // --- path / name sandboxing -------------------------------------------------

  /**
   * Normalises a user-supplied path to a safe, account-home-relative path.
   * Resolves "." / ".." segments and refuses any attempt to escape the home
   * root. DA already confines the impersonated user, but we never rely on a
   * single layer for path safety.
   */
  private safePath(input: string | undefined): string {
    const raw = (input ?? '/').trim();
    if (raw.includes('\0')) throw new BadRequestException('Nieprawidłowa ścieżka.');
    const segments: string[] = [];
    for (const part of raw.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (segments.length === 0) {
          throw new ForbiddenException('Ścieżka poza katalogiem domowym jest niedozwolona.');
        }
        segments.pop();
        continue;
      }
      segments.push(part);
    }
    return '/' + segments.join('/');
  }

  /** Validates a single file/folder name (no separators, no traversal). */
  private safeName(name: string | undefined): string {
    const n = (name ?? '').trim();
    if (!n || n === '.' || n === '..') throw new BadRequestException('Nieprawidłowa nazwa.');
    if (/[/\\\0]/.test(n)) throw new BadRequestException('Nazwa nie może zawierać ukośników.');
    if (n.length > 255) throw new BadRequestException('Nazwa jest zbyt długa.');
    return n;
  }

  /**
   * Wpisy systemowe katalogu domowego (`pliki-systemowe-konta.ts`): klient ich nie widzi i nic na nich
   * nie zrobi bezpośrednim wywołaniem API — ani na nich samych, ani na niczym w ich wnętrzu.
   */
  private odmowDlaSystemowych(...sciezki: string[]): void {
    if (sciezki.some(jestWpisemSystemowym)) {
      throw new ForbiddenException('Ten element jest zarządzany przez serwer — nie można go otwierać ani zmieniać.');
    }
  }

  // --- operations -------------------------------------------------------------

  async list(
    subscriptionId: string,
    userId: string,
    path: string | undefined,
  ): Promise<{ path: string; entries: DaFileEntry[] }> {
    const account = await this.requireAccount(subscriptionId, userId);
    const safe = this.safePath(path);
    this.odmowDlaSystemowych(safe);
    const client = await this.clientFor(account);
    const entries = await client.listDir(safe);
    return { path: safe, entries: safe === '/' ? entries.filter((e) => !jestWpisemSystemowym(e.name)) : entries };
  }

  /**
   * Best-effort file size from the parent directory listing — lets us reject
   * oversized files BEFORE loading them into memory. Returns null if unknown.
   */
  private async fileSizeBytes(
    client: Awaited<ReturnType<FilesService['clientFor']>>,
    safe: string,
  ): Promise<number | null> {
    const idx = safe.lastIndexOf('/');
    const dir = idx <= 0 ? '/' : safe.slice(0, idx);
    const name = safe.slice(idx + 1);
    try {
      const entries = await client.listDir(dir);
      const hit = entries.find((e) => e.name === name && e.type === 'file');
      return hit ? hit.sizeBytes : null;
    } catch {
      return null;
    }
  }

  /**
   * H-13 — pobranie dużego pliku (np. archiwum kopii z ~/backups) strumieniem: bajty idą z DA
   * prosto do odpowiedzi, bez ładowania całego pliku do pamięci API (limit 100 MB z `download`
   * tu nie obowiązuje). Ta sama piaskownica ścieżek i ta sama własność usługi.
   */
  async downloadStream(
    subscriptionId: string,
    userId: string,
    path: string | undefined,
  ): Promise<{ filename: string; stream: NodeJS.ReadableStream; size: number | null }> {
    const account = await this.requireAccount(subscriptionId, userId);
    const safe = this.safePath(path);
    if (safe === '/') throw new BadRequestException('Wskaż plik do pobrania.');
    this.odmowDlaSystemowych(safe);
    const client = await this.clientFor(account);
    const size = await this.fileSizeBytes(client, safe);
    if (size == null) throw new NotFoundException('Nie ma takiego pliku.');
    const surowy = (client as unknown as { client?: { get(p: string, c: Record<string, unknown>): Promise<{ data: unknown }> } }).client;
    if (!surowy) throw new BadRequestException('Serwer plików jest chwilowo niedostępny.');
    const res = await surowy.get(`/CMD_FILE_MANAGER${safe}`, { responseType: 'stream', timeout: 0 });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_DOWNLOADED,
      userId, actorUserId: userId, details: { subscriptionId, path: safe, size },
    });
    return { filename: safe.split('/').pop() || 'plik', stream: res.data as NodeJS.ReadableStream, size };
  }

  /**
   * Audyt 13.10 (files.service.ts:download:buffered-without-aggregate-limit) — odczyty buforowane w pamięci wspólnego
   * procesu API: najwyżej MAX_ODCZYTOW_NA_KONTO naraz na konto hostingowe (nadmiar → 429), a odbiór przerywany po
   * przekroczeniu limitu bajtów (axios maxContentLength), zanim cały plik trafi do pamięci.
   */
  private readonly odczytyWToku = new Map<string, number>();

  private async zLimitemOdczytow<T>(kontoId: string, fn: () => Promise<T>): Promise<T> {
    const n = this.odczytyWToku.get(kontoId) ?? 0;
    if (n >= MAX_ODCZYTOW_NA_KONTO) {
      throw new HttpException('Za dużo równoczesnych pobrań plików. Spróbuj za chwilę.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.odczytyWToku.set(kontoId, n + 1);
    try {
      return await fn();
    } finally {
      const m = (this.odczytyWToku.get(kontoId) ?? 1) - 1;
      if (m <= 0) this.odczytyWToku.delete(kontoId);
      else this.odczytyWToku.set(kontoId, m);
    }
  }

  private async pobierzZLimitem(client: { downloadFile(p: string, max?: number): Promise<Buffer> }, sciezka: string, max: number, komunikat: string): Promise<Buffer> {
    let buf: Buffer;
    try {
      buf = await client.downloadFile(sciezka, max);
    } catch (e) {
      // axios: „maxContentLength size of N exceeded” — plik urósł po sprawdzeniu rozmiaru albo listing kłamał.
      if (/maxContentLength/i.test((e as Error).message ?? '')) throw new PayloadTooLargeException(komunikat);
      throw e;
    }
    if (buf.length > max) throw new PayloadTooLargeException(komunikat);
    return buf;
  }

  async read(
    subscriptionId: string,
    userId: string,
    path: string | undefined,
  ): Promise<{ path: string; content: string }> {
    const account = await this.requireAccount(subscriptionId, userId);
    const safe = this.safePath(path);
    if (safe === '/') throw new BadRequestException('Wskaż plik do odczytu.');
    this.odmowDlaSystemowych(safe);
    const client = await this.clientFor(account);
    const size = await this.fileSizeBytes(client, safe);
    // Audyt 13.10 — nieznany rozmiar to odmowa (jak downloadStream), nie „pobierz i zobacz”.
    if (size == null) throw new NotFoundException('Nie ma takiego pliku.');
    if (size > MAX_EDIT_BYTES) {
      throw new PayloadTooLargeException('Plik jest zbyt duży do edycji w panelu.');
    }
    const buf = await this.zLimitemOdczytow(account.id, () => this.pobierzZLimitem(client, safe, MAX_EDIT_BYTES, 'Plik jest zbyt duży do edycji w panelu.'));
    if (buf.length > MAX_EDIT_BYTES) {
      throw new PayloadTooLargeException('Plik jest zbyt duży do edycji w panelu.');
    }
    return { path: safe, content: buf.toString('utf8') };
  }

  async download(
    subscriptionId: string,
    userId: string,
    path: string | undefined,
  ): Promise<{ filename: string; data: Buffer }> {
    const account = await this.requireAccount(subscriptionId, userId);
    const safe = this.safePath(path);
    if (safe === '/') throw new BadRequestException('Wskaż plik do pobrania.');
    this.odmowDlaSystemowych(safe);
    const client = await this.clientFor(account);
    // Guard memory: reject oversized files before loading them into RAM.
    const size = await this.fileSizeBytes(client, safe);
    if (size == null) throw new NotFoundException('Nie ma takiego pliku.');
    if (size > MAX_DOWNLOAD_BYTES) {
      throw new PayloadTooLargeException(
        'Plik jest zbyt duży do pobrania przez panel (limit 100 MB). Użyj FTP.',
      );
    }
    const data = await this.zLimitemOdczytow(account.id, () =>
      this.pobierzZLimitem(client, safe, MAX_DOWNLOAD_BYTES, 'Plik jest zbyt duży do pobrania przez panel (limit 100 MB). Użyj FTP.'),
    );
    if (data.length > MAX_DOWNLOAD_BYTES) {
      throw new PayloadTooLargeException(
        'Plik jest zbyt duży do pobrania przez panel (limit 100 MB). Użyj FTP.',
      );
    }
    return { filename: safe.split('/').pop() || 'plik', data };
  }

  async write(
    subscriptionId: string,
    userId: string,
    dir: string | undefined,
    filename: string,
    content: string,
  ): Promise<{ ok: true }> {
    if (Buffer.byteLength(content ?? '', 'utf8') > MAX_WRITE_BYTES) {
      throw new PayloadTooLargeException('Zawartość pliku jest zbyt duża.');
    }
    const account = await this.requireAccount(subscriptionId, userId);
    const safeDir = this.safePath(dir);
    const name = this.safeName(filename);
    this.odmowDlaSystemowych(wKatalogu(safeDir, name));
    const client = await this.clientFor(account);
    await client.writeFile(safeDir, name, content ?? '');
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_WRITTEN,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, path: `${safeDir}/${name}` },
    });
    return { ok: true };
  }

  async mkdir(
    subscriptionId: string,
    userId: string,
    dir: string | undefined,
    name: string,
  ): Promise<{ ok: true }> {
    const account = await this.requireAccount(subscriptionId, userId);
    const safeDir = this.safePath(dir);
    const safeName = this.safeName(name);
    this.odmowDlaSystemowych(wKatalogu(safeDir, safeName));
    const client = await this.clientFor(account);
    await client.makeDir(safeDir, safeName);
    return { ok: true };
  }

  async rename(
    subscriptionId: string,
    userId: string,
    dir: string | undefined,
    oldName: string,
    newName: string,
  ): Promise<{ ok: true }> {
    const account = await this.requireAccount(subscriptionId, userId);
    const safeDir = this.safePath(dir);
    const oldN = this.safeName(oldName);
    const newN = this.safeName(newName);
    this.odmowDlaSystemowych(wKatalogu(safeDir, oldN), wKatalogu(safeDir, newN));
    const client = await this.clientFor(account);
    await client.renameEntry(safeDir, oldN, newN);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_RENAMED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, dir: safeDir, from: oldN, to: newN },
    });
    return { ok: true };
  }

  async remove(
    subscriptionId: string,
    userId: string,
    dir: string | undefined,
    names: string[],
  ): Promise<{ ok: true; deleted: number }> {
    if (!Array.isArray(names) || names.length === 0) {
      throw new BadRequestException('Wskaż co najmniej jeden element do usunięcia.');
    }
    const account = await this.requireAccount(subscriptionId, userId);
    const safeDir = this.safePath(dir);
    const safeNames = names.map((n) => this.safeName(n));
    this.odmowDlaSystemowych(...safeNames.map((n) => wKatalogu(safeDir, n)));
    const client = await this.clientFor(account);
    await client.deleteEntries(safeDir, safeNames);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_DELETED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, dir: safeDir, names: safeNames },
    });
    return { ok: true, deleted: safeNames.length };
  }

  async upload(
    subscriptionId: string,
    userId: string,
    dir: string | undefined,
    filename: string,
    data: Buffer,
  ): Promise<{ ok: true }> {
    if (!data || data.length === 0) throw new BadRequestException('Pusty plik.');
    if (data.length > MAX_WRITE_BYTES) {
      throw new PayloadTooLargeException('Plik przekracza dozwolony rozmiar (25 MB).');
    }
    const account = await this.requireAccount(subscriptionId, userId);
    const safeDir = this.safePath(dir);
    const name = this.safeName(filename);
    this.odmowDlaSystemowych(wKatalogu(safeDir, name));
    const client = await this.clientFor(account);
    await client.uploadFile(safeDir, name, data);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_UPLOADED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, path: `${safeDir}/${name}`, bytes: data.length },
    });
    return { ok: true };
  }

  /** Copies or moves entries between directories (DA clipboard flow). */
  async transfer(
    subscriptionId: string,
    userId: string,
    dir: string | undefined,
    names: string[],
    destDir: string | undefined,
    mode: 'copy' | 'move',
  ): Promise<{ ok: true; count: number }> {
    if (!Array.isArray(names) || names.length === 0) {
      throw new BadRequestException('Wskaż co najmniej jeden element.');
    }
    if (names.length > 100) {
      throw new BadRequestException('Za dużo elementów naraz (limit 100).');
    }
    const account = await this.requireAccount(subscriptionId, userId);
    const safeDir = this.safePath(dir);
    const safeDest = this.safePath(destDir);
    if (safeDest === safeDir) {
      throw new BadRequestException('Katalog docelowy jest taki sam jak źródłowy.');
    }
    const safeNames = names.map((n) => this.safeName(n));
    this.odmowDlaSystemowych(
      ...safeNames.map((n) => wKatalogu(safeDir, n)),
      ...safeNames.map((n) => wKatalogu(safeDest, n)),
    );
    if (mode === 'move') {
      // Przenoszenie katalogu do jego wnętrza kończy się pętlą — blokujemy.
      for (const n of safeNames) {
        const src = `${safeDir === '/' ? '' : safeDir}/${n}`;
        if (safeDest === src || safeDest.startsWith(`${src}/`)) {
          throw new BadRequestException('Nie można przenieść katalogu do jego wnętrza.');
        }
      }
    }
    const client = await this.clientFor(account);
    await client.transferEntries(safeDir, safeNames, safeDest, mode);
    await this.audit.record({
      action:
        mode === 'copy'
          ? HostingResourceActions.HOSTING_FILE_COPIED
          : HostingResourceActions.HOSTING_FILE_MOVED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, from: safeDir, to: safeDest, names: safeNames },
    });
    return { ok: true, count: safeNames.length };
  }

  /** C-11 — pakuje zaznaczone elementy katalogu do archiwum .tar.gz w tym katalogu. */
  async compress(
    subscriptionId: string,
    userId: string,
    dir: string | undefined,
    names: string[],
    archiveName: string,
  ): Promise<{ ok: true; archive: string }> {
    if (!Array.isArray(names) || names.length === 0) {
      throw new BadRequestException('Wskaż co najmniej jeden element.');
    }
    const base = String(archiveName ?? '').trim().replace(/\.(tar\.gz|tgz|zip|tar)$/i, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(base)) {
      throw new BadRequestException('Nazwa archiwum: litery, cyfry, kropka, myślnik lub podkreślnik.');
    }
    const account = await this.requireAccount(subscriptionId, userId);
    const safeDir = this.safePath(dir);
    const safeNames = names.map((n) => this.safeName(n));
    this.odmowDlaSystemowych(...safeNames.map((n) => wKatalogu(safeDir, n)));
    const client = await this.clientFor(account);
    await client.compressEntries(safeDir, safeNames, base);
    const archive = `${safeDir === '/' ? '' : safeDir}/${base}.tar.gz`;
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_COMPRESSED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, dir: safeDir, names: safeNames, archive },
    });
    return { ok: true, archive };
  }

  /** Extracts an archive (zip/tar.gz/tar) into a directory on the account. */
  async extract(
    subscriptionId: string,
    userId: string,
    path: string | undefined,
    destDir: string | undefined,
  ): Promise<{ ok: true }> {
    const account = await this.requireAccount(subscriptionId, userId);
    const safe = this.safePath(path);
    if (safe === '/') throw new BadRequestException('Wskaż archiwum do rozpakowania.');
    if (!/\.(zip|tar\.gz|tgz|tar\.bz2|tar)$/i.test(safe)) {
      throw new BadRequestException('Obsługiwane archiwa: .zip, .tar.gz, .tgz, .tar.bz2, .tar.');
    }
    const safeDest = this.safePath(destDir ?? safe.slice(0, safe.lastIndexOf('/')) ?? '/');
    this.odmowDlaSystemowych(safe, safeDest);
    const client = await this.clientFor(account);
    await client.extractArchive(safe, safeDest);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_EXTRACTED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, archive: safe, to: safeDest },
    });
    return { ok: true };
  }

  /** Sets permissions (chmod) on entries in a directory. */
  async chmod(
    subscriptionId: string,
    userId: string,
    dir: string | undefined,
    names: string[],
    mode: string,
  ): Promise<{ ok: true; count: number }> {
    if (!Array.isArray(names) || names.length === 0) {
      throw new BadRequestException('Wskaż co najmniej jeden element.');
    }
    const chmod = String(mode ?? '').trim();
    if (!/^[0-7]{3,4}$/.test(chmod)) {
      throw new BadRequestException('Uprawnienia podaj ósemkowo, np. 644 lub 755.');
    }
    const account = await this.requireAccount(subscriptionId, userId);
    const safeDir = this.safePath(dir);
    const safeNames = names.map((n) => this.safeName(n));
    this.odmowDlaSystemowych(...safeNames.map((n) => wKatalogu(safeDir, n)));
    const client = await this.clientFor(account);
    await client.chmodEntries(safeDir, safeNames, chmod);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FILE_CHMOD_SET,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, dir: safeDir, names: safeNames, chmod },
    });
    return { ok: true, count: safeNames.length };
  }
}
