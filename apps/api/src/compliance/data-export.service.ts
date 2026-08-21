import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { mkdir, stat, unlink } from 'fs/promises';
import { createWriteStream } from 'fs';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { ConfigService } from '@nestjs/config';
import * as archiver from 'archiver';
import { DataExportStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RodoActions } from '../common/audit/audit.actions';
import { MailerService } from '../mail/mailer.service';
import { dataExportReadyTemplate } from '../mail/templates/data-export-notifications';
import { ObjectStorageService } from '../storage/object-storage.service';
import { ObjectBuckets } from '../storage/object-storage.types';
import type { Readable } from 'stream';

export interface DataExportSummary {
  id: string;
  status: DataExportStatus;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
  errorMessage: string | null;
}

/** Stale-detection threshold for `PENDING`/`GENERATING` rows on app boot. */
const STALE_GENERATING_AFTER_MS = 60 * 60 * 1000;
/** TTL for ready exports — after this we mark `EXPIRED` and delete the file. */
const READY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Cooldown to prevent abuse — at most one fresh request per user per 24h. */
const REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * GDPR Art. 20 — right to data portability.
 *
 * Flow:
 *  1. User clicks "Pobierz kopię moich danych" → `POST /me/data-export`.
 *  2. Row created with `status = PENDING`, audit logged.
 *  3. Background worker (in-process Promise) builds a ZIP archive in a temp
 *     directory containing:
 *      - `profile.json` — sanitized user PII,
 *      - `consents.json`, `marketing-preferences.json`,
 *      - `accounts.json`, `subscriptions.json`, `invoices.json`,
 *      - `wallet-transactions.json`, `tickets.json`, `audit-log.json`,
 *      - `data-export-requests.json`, `account-deletion-requests.json`,
 *      - `attachments/<filename>` — every ticket attachment uploaded by the
 *        user, downloaded from MinIO `verris-ticket-attachments` bucket and
 *        embedded in the ZIP. Original filenames preserved (collisions are
 *        prefixed with the attachment id).
 *  4. The ZIP is uploaded to MinIO `verris-data-exports` bucket via
 *     `fPutObject` (multipart, native fs streaming). Local temp file is
 *     deleted after a successful upload.
 *  5. Row updated to `status = READY` with download token + 7-day TTL.
 *  6. **Email with download link is sent** to the user (`MailerService`).
 *  7. User downloads via `GET /me/data-export/download/:token` — the
 *     controller streams the object from MinIO directly to the response.
 *  8. `RetentionScheduler` (L-10) marks `EXPIRED` after 7 days and removes
 *     the object from MinIO. As a defense-in-depth, the bucket also has a
 *     7-day lifecycle rule.
 *  9. **Boot recovery**: on application start (`OnApplicationBootstrap`) we
 *     mark `PENDING`/`GENERATING` rows older than 1h as `FAILED` so they can
 *     be retried by the user or by the admin retry button.
 *
 * Anti-DoS: at most one active or recent (≤24h) request per user.
 */
@Injectable()
export class DataExportService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DataExportService.name);
  /** Local temp directory for ZIP staging — only the build is local; the
   *  finished ZIP is uploaded to MinIO and the local copy deleted. */
  private readonly tempDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly storage: ObjectStorageService,
  ) {
    const configured = this.config.get<string>('DATA_EXPORT_TEMP_DIR');
    this.tempDir = resolve(configured ?? join(tmpdir(), 'verris-data-exports'));
  }

  // ---------------------------------------------------------------------------
  // OnApplicationBootstrap — recover stale jobs after a crash/restart
  // ---------------------------------------------------------------------------

  async onApplicationBootstrap(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_GENERATING_AFTER_MS);
    const stale = await this.prisma.dataExportRequest.findMany({
      where: {
        status: { in: [DataExportStatus.PENDING, DataExportStatus.GENERATING] },
        startedAt: { lt: cutoff },
      },
      select: { id: true },
    });
    if (stale.length === 0) {
      const stalePending = await this.prisma.dataExportRequest.findMany({
        where: {
          status: DataExportStatus.PENDING,
          requestedAt: { lt: cutoff },
        },
        select: { id: true },
      });
      stale.push(...stalePending);
    }
    if (stale.length === 0) return;

    this.logger.warn(
      `Boot recovery: marking ${stale.length} stale data-export job(s) as FAILED so they can be retried.`,
    );
    await this.prisma.dataExportRequest.updateMany({
      where: { id: { in: stale.map((r) => r.id) } },
      data: {
        status: DataExportStatus.FAILED,
        errorMessage: 'Aborted by application restart — please request a new export.',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Read API
  // ---------------------------------------------------------------------------

  async listForUser(userId: string): Promise<DataExportSummary[]> {
    const rows = await this.prisma.dataExportRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    });
    return rows.map((row) => this.toSummary(row));
  }

  async getActiveForUser(userId: string) {
    return this.prisma.dataExportRequest.findFirst({
      where: {
        userId,
        status: { in: [DataExportStatus.PENDING, DataExportStatus.GENERATING, DataExportStatus.READY] },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Request → background generate
  // ---------------------------------------------------------------------------

  async request(
    userId: string,
    ctx: { ipAddress?: string | null; userAgent?: string | null } = {},
  ): Promise<DataExportSummary> {
    const recent = await this.prisma.dataExportRequest.findFirst({
      where: {
        userId,
        requestedAt: { gte: new Date(Date.now() - REQUEST_COOLDOWN_MS) },
      },
      orderBy: { requestedAt: 'desc' },
    });
    if (recent && recent.status !== DataExportStatus.FAILED) {
      throw new BadRequestException(
        'Masz już aktywną prośbę o eksport danych z ostatnich 24 godzin. Spróbuj ponownie później lub pobierz istniejący eksport.',
      );
    }

    const created = await this.prisma.dataExportRequest.create({
      data: {
        userId,
        status: DataExportStatus.PENDING,
      },
    });

    await this.audit.record({
      action: RodoActions.DATA_EXPORT_REQUESTED,
      userId,
      details: { exportRequestId: created.id },
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
    });

    void this.generateInBackground(created.id).catch((err) => {
      this.logger.error(
        `Background data export failed for request=${created.id}: ${err.message}`,
        err.stack,
      );
    });

    return this.toSummary(created);
  }

  /**
   * Internal: build the export ZIP and update the request row.
   * Exposed for admin "retry" path too.
   */
  async generateInBackground(requestId: string): Promise<void> {
    const reqRow = await this.prisma.dataExportRequest.findUnique({
      where: { id: requestId },
    });
    if (!reqRow) return;
    if (reqRow.status === DataExportStatus.GENERATING) return; // already running

    await this.prisma.dataExportRequest.update({
      where: { id: requestId },
      data: { status: DataExportStatus.GENERATING, startedAt: new Date() },
    });

    const filename = `data-export-${reqRow.userId}-${reqRow.id}.zip`;
    const tempPath = join(this.tempDir, filename);
    await mkdir(dirname(tempPath), { recursive: true });

    try {
      // 1) Build ZIP locally (temp file). Local FS gives us atomic semantics
      //    + lets us know the final size before we hit the network.
      await this.buildZipToFile(reqRow.userId, tempPath);
      const stats = await stat(tempPath);

      // 2) Upload to MinIO (multipart under the hood for big artifacts).
      await this.storage.putFile(ObjectBuckets.DATA_EXPORTS, filename, tempPath, {
        contentType: 'application/zip',
        originalFilename: filename,
        custom: {
          userid: reqRow.userId,
          requestid: reqRow.id,
        },
      });

      // 3) Cleanup local temp file. If unlink fails (e.g. permissions), log
      //    but don't fail — the operator's tmp cleanup cron will mop up.
      await unlink(tempPath).catch((err) => {
        this.logger.warn(`Could not unlink temp export ${tempPath}: ${(err as Error).message}`);
      });

      const downloadToken = randomBytes(32).toString('base64url');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + READY_TTL_MS);

      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: {
          status: DataExportStatus.READY,
          completedAt: now,
          downloadToken,
          storageKey: filename,
          sizeBytes: stats.size,
          expiresAt,
          errorMessage: null,
        },
      });

      await this.audit.record({
        action: RodoActions.DATA_EXPORT_GENERATED,
        userId: reqRow.userId,
        details: {
          exportRequestId: requestId,
          sizeBytes: stats.size,
          expiresAt: expiresAt.toISOString(),
        },
      });

      void this.notifyDataExportReady(reqRow.userId, downloadToken, expiresAt, stats.size).catch(
        (err) => {
          this.logger.warn(
            `notifyDataExportReady failed for request=${requestId}: ${(err as Error).message}`,
          );
        },
      );
    } catch (err) {
      // Cleanup temp on failure (best-effort).
      await unlink(tempPath).catch(() => undefined);

      const message = (err as Error).message;
      this.logger.error(`Failed to generate export ${requestId}: ${message}`);
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: {
          status: DataExportStatus.FAILED,
          errorMessage: message.slice(0, 500),
        },
      });
      await this.audit.record({
        action: RodoActions.DATA_EXPORT_FAILED,
        userId: reqRow.userId,
        details: { exportRequestId: requestId, error: message.slice(0, 200) },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------------

  /**
   * Resolves the storage key + metadata for a download token. The actual
   * stream is opened by the controller via `openDownloadStream` to avoid
   * holding two responses (DB + S3) open simultaneously when validating.
   */
  async resolveDownloadToken(token: string): Promise<{
    storageKey: string;
    requestId: string;
    userId: string;
    sizeBytes: number | null;
  }> {
    const row = await this.prisma.dataExportRequest.findUnique({
      where: { downloadToken: token },
    });
    if (!row || row.status !== DataExportStatus.READY) {
      throw new NotFoundException('Eksport jest niedostępny lub wygasł.');
    }
    if (row.expiresAt && row.expiresAt < new Date()) {
      throw new NotFoundException('Eksport wygasł. Wygeneruj nowy.');
    }
    if (!row.storageKey) {
      throw new NotFoundException('Plik eksportu został usunięty.');
    }
    return {
      storageKey: row.storageKey,
      requestId: row.id,
      userId: row.userId,
      sizeBytes: row.sizeBytes,
    };
  }

  /**
   * Streams the export ZIP from MinIO. Caller is expected to pipe the
   * result into the HTTP response (e.g. NestJS `StreamableFile`). Also
   * records the download in the audit log.
   */
  async openDownloadStream(token: string): Promise<{
    stream: Readable;
    filename: string;
    requestId: string;
    userId: string;
  }> {
    const meta = await this.resolveDownloadToken(token);
    const stream = await this.storage.getObjectStream(
      ObjectBuckets.DATA_EXPORTS,
      meta.storageKey,
    );

    await this.prisma.dataExportRequest.update({
      where: { id: meta.requestId },
      data: { downloadedAt: new Date() },
    });
    await this.audit.record({
      action: RodoActions.DATA_EXPORT_DOWNLOADED,
      userId: meta.userId,
      details: { exportRequestId: meta.requestId, sizeBytes: meta.sizeBytes },
    });

    return {
      stream,
      filename: meta.storageKey,
      requestId: meta.requestId,
      userId: meta.userId,
    };
  }

  // ---------------------------------------------------------------------------
  // Retention (called by RetentionScheduler, L-10)
  // ---------------------------------------------------------------------------

  async expireDueExports(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.dataExportRequest.findMany({
      where: {
        status: DataExportStatus.READY,
        expiresAt: { lt: now },
      },
      take: 100,
    });
    for (const row of due) {
      try {
        if (row.storageKey) {
          await this.storage
            .removeObject(ObjectBuckets.DATA_EXPORTS, row.storageKey)
            .catch(() => undefined);
        }
        await this.prisma.dataExportRequest.update({
          where: { id: row.id },
          data: {
            status: DataExportStatus.EXPIRED,
            storageKey: null,
            downloadToken: null,
          },
        });
        await this.audit.record({
          action: RodoActions.DATA_EXPORT_EXPIRED,
          userId: row.userId,
          details: { exportRequestId: row.id },
        });
      } catch (err) {
        this.logger.error(
          `Failed to expire data export ${row.id}: ${(err as Error).message}`,
        );
      }
    }
    return due.length;
  }

  // ---------------------------------------------------------------------------
  // Internal: build ZIP archive on local disk
  // ---------------------------------------------------------------------------

  private async buildZipToFile(userId: string, fullPath: string): Promise<void> {
    const sections = await this.collectSections(userId);
    const attachments = await this.collectTicketAttachments(userId);

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(fullPath);
      const archive = archiver.create('zip', { zlib: { level: 6 } });

      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          this.logger.warn(`archiver warning (skipped missing file): ${err.message}`);
        } else {
          reject(err);
        }
      });

      archive.pipe(output);

      archive.append(buildReadme(userId), { name: 'README.txt' });

      for (const [name, payload] of Object.entries(sections)) {
        archive.append(JSON.stringify(payload, jsonReplacer, 2), { name: `${name}.json` });
      }

      // Streaming each attachment from MinIO directly into the archive —
      // archiver consumes Readable streams natively. We pipe from S3 GET,
      // not from local FS, so this works regardless of where MinIO lives.
      const finalize = async () => {
        try {
          for (const att of attachments) {
            archive.append(att.stream, { name: `attachments/${att.archiveName}` });
          }
          await archive.finalize();
        } catch (err) {
          reject(err as Error);
        }
      };
      void finalize();
    });
  }

  private async collectSections(userId: string): Promise<Record<string, unknown>> {
    const [user, accounts, subscriptions, walletTxs, invoices, tickets, ticketAttachments,
      ticketReplies, consents, prefs, exports, deletions, auditLogs] =
      await this.prisma.$transaction([
        this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        this.prisma.account.findMany({ where: { userId } }),
        this.prisma.subscription.findMany({ where: { userId } }),
        this.prisma.walletTransaction.findMany({ where: { userId } }),
        this.prisma.invoice.findMany({ where: { userId } }),
        this.prisma.ticket.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.ticketAttachment.findMany({
          where: { ticket: { userId } },
          select: {
            id: true,
            ticketId: true,
            replyId: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            storageKey: true,
            uploadedById: true,
            createdAt: true,
          },
        }),
        this.prisma.ticketReply.findMany({
          where: { ticket: { userId } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.userConsent.findMany({ where: { userId } }),
        this.prisma.marketingPreferences.findUnique({ where: { userId } }),
        this.prisma.dataExportRequest.findMany({ where: { userId } }),
        this.prisma.accountDeletionRequest.findMany({ where: { userId } }),
        this.prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      ]);

    const sanitizedUser = {
      ...user,
      passwordHash: '[REDACTED]',
      twoFactorSecret: user.twoFactorSecret ? '[REDACTED]' : null,
      twoFactorRecoveryCodesEnc: user.twoFactorRecoveryCodesEnc ? '[REDACTED]' : null,
    };
    const sanitizedAccounts = accounts.map((a) => ({
      ...a,
      daPasswordEnc: a.daPasswordEnc ? '[REDACTED]' : null,
    }));

    return {
      _meta: {
        section: '_meta',
        generatedAt: new Date().toISOString(),
        format: 'zip-of-json',
        notice:
          'This archive contains all personal data Verris stores about your account, in machine-readable form (RODO Art. 20).',
      },
      profile: sanitizedUser,
      'marketing-preferences': prefs,
      consents,
      accounts: sanitizedAccounts,
      subscriptions,
      invoices,
      'wallet-transactions': walletTxs,
      tickets,
      'ticket-replies': ticketReplies,
      'ticket-attachments': ticketAttachments,
      'data-export-requests': exports,
      'account-deletion-requests': deletions,
      'audit-log': auditLogs,
    };
  }

  /**
   * Returns a list of `(stream, archiveName)` tuples for every ticket
   * attachment that belongs to the user. Streams are opened from MinIO
   * (`verris-ticket-attachments` bucket) and piped into the ZIP archive.
   * Missing objects are silently skipped (archiver logs a warning).
   */
  private async collectTicketAttachments(userId: string): Promise<
    Array<{ stream: Readable; archiveName: string }>
  > {
    const rows = await this.prisma.ticketAttachment.findMany({
      where: { ticket: { userId } },
      select: { id: true, originalName: true, storageKey: true },
    });
    const seen = new Set<string>();
    const out: Array<{ stream: Readable; archiveName: string }> = [];
    for (const row of rows) {
      const safeName = sanitizeFilename(row.originalName);
      let archiveName = safeName;
      if (seen.has(archiveName)) {
        archiveName = `${row.id}_${safeName}`;
      }
      seen.add(archiveName);

      try {
        const stream = await this.storage.getObjectStream(
          ObjectBuckets.TICKET_ATTACHMENTS,
          row.storageKey,
        );
        out.push({ stream, archiveName });
      } catch (err) {
        // Object missing in MinIO — log and skip; archiver's `warning`
        // handler will treat ENOENT-equivalent as warning and continue.
        this.logger.warn(
          `Skipping ticket attachment ${row.id} — could not open from MinIO: ${
            (err as Error).message
          }`,
        );
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Email notifications
  // ---------------------------------------------------------------------------

  private async notifyDataExportReady(
    userId: string,
    downloadToken: string,
    expiresAt: Date,
    sizeBytes: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) return;

    const apiUrl =
      this.config.get<string>('PUBLIC_API_URL') ??
      this.config.get<string>('publicApiUrl') ??
      'https://api.verris.pl';
    const panelUrl =
      this.config.get<string>('CLIENT_PANEL_URL') ??
      this.config.get<string>('clientPanelUrl') ??
      'https://panel.verris.pl';

    const message = dataExportReadyTemplate({
      to: user.email,
      firstName: user.firstName,
      downloadUrl: `${apiUrl}/me/data-export/download/${downloadToken}`,
      expiresAt,
      sizeBytes,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'RODO' });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private toSummary(row: {
    id: string;
    status: DataExportStatus;
    requestedAt: Date;
    completedAt: Date | null;
    expiresAt: Date | null;
    sizeBytes: number | null;
    downloadToken: string | null;
    errorMessage: string | null;
  }): DataExportSummary {
    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      sizeBytes: row.sizeBytes,
      downloadUrl:
        row.status === DataExportStatus.READY && row.downloadToken
          ? `/me/data-export/download/${row.downloadToken}`
          : null,
      errorMessage: row.errorMessage,
    };
  }
}

// ----------------------------------------------------------------------------
// Module-private helpers
// ----------------------------------------------------------------------------

function sanitizeFilename(input: string): string {
  const cleaned = input.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'attachment';
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function buildReadme(userId: string): string {
  return [
    'Verris — eksport danych osobowych (RODO art. 20)',
    '================================================',
    '',
    `Zawartość tego archiwum dotyczy konta o identyfikatorze: ${userId}`,
    `Wygenerowano: ${new Date().toISOString()}`,
    '',
    'Pliki w archiwum:',
    '  README.txt                       — ten plik.',
    '  profile.json                     — dane konta (e-mail, dane do faktury, flagi).',
    '  consents.json                    — historia akceptacji regulaminu, polityki, DPA.',
    '  marketing-preferences.json       — preferencje komunikacji (newsletter, kampanie).',
    '  accounts.json                    — konta hostingowe (DirectAdmin), bez haseł.',
    '  subscriptions.json               — subskrypcje (plan, status, okresy).',
    '  invoices.json                    — faktury VAT (zachowane 5 lat — wymóg PL).',
    '  wallet-transactions.json         — historia portfela (kredyty, doładowania).',
    '  tickets.json                     — zgłoszenia do supportu (treść początkowa).',
    '  ticket-replies.json              — odpowiedzi w wątkach.',
    '  ticket-attachments.json          — metadane załączników (lista plików).',
    '  audit-log.json                   — log audytowy operacji na koncie.',
    '  data-export-requests.json        — historia żądań eksportu danych.',
    '  account-deletion-requests.json   — historia żądań usunięcia konta.',
    '  attachments/<plik>               — fizyczne kopie załączników z ticketów.',
    '',
    'Format: UTF-8, JSON. Zewnętrzny plik archiwum: ZIP (deflate).',
    '',
    'Pole, które nigdy nie opuszcza naszego systemu w eksporcie:',
    '  - hash hasła (passwordHash) → "[REDACTED]"',
    '  - sekret 2FA (twoFactorSecret) → "[REDACTED]"',
    '  - kody odzyskiwania 2FA → "[REDACTED]"',
    '  - hasła kont DirectAdmin (daPasswordEnc) → "[REDACTED]"',
    '',
    'Pełne wyjaśnienie polityki eksportu i podstawy prawnej:',
    '  https://verris.pl/legal/privacy',
    '',
    'Kontakt RODO: rodo@verris.pl',
    '',
  ].join('\n');
}
