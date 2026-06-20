import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { DaFileEntry } from '@verris/directadmin-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';

/** Max bytes we will read into the in-panel text editor. */
const MAX_EDIT_BYTES = 1_000_000; // 1 MB
/** Max upload / write size. */
const MAX_WRITE_BYTES = 25_000_000; // 25 MB

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
    if (/[\/\\\0]/.test(n)) throw new BadRequestException('Nazwa nie może zawierać ukośników.');
    if (n.length > 255) throw new BadRequestException('Nazwa jest zbyt długa.');
    return n;
  }

  // --- operations -------------------------------------------------------------

  async list(
    subscriptionId: string,
    userId: string,
    path: string | undefined,
  ): Promise<{ path: string; entries: DaFileEntry[] }> {
    const account = await this.requireAccount(subscriptionId, userId);
    const safe = this.safePath(path);
    const client = await this.clientFor(account);
    const entries = await client.listDir(safe);
    return { path: safe, entries };
  }

  async read(
    subscriptionId: string,
    userId: string,
    path: string | undefined,
  ): Promise<{ path: string; content: string }> {
    const account = await this.requireAccount(subscriptionId, userId);
    const safe = this.safePath(path);
    if (safe === '/') throw new BadRequestException('Wskaż plik do odczytu.');
    const client = await this.clientFor(account);
    const buf = await client.downloadFile(safe);
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
    const client = await this.clientFor(account);
    const data = await client.downloadFile(safe);
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
}
