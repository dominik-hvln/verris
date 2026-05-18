/**
 * Storage migration CLI — backfills file artifacts from local filesystem
 * into MinIO/S3.
 *
 * Why this exists
 *   We started with `TICKET_UPLOAD_DIR` (e.g. `./uploads/tickets`) for ticket
 *   attachments and `DATA_EXPORT_STORAGE_DIR` for RODO data exports. Both are
 *   now stored in MinIO buckets (`verris-ticket-attachments`,
 *   `verris-data-exports`). After the cutover deploy, **any pre-existing
 *   artifacts left on disk are invisible to the new code** — they need to be
 *   uploaded to MinIO so URLs/streams keep working.
 *
 * What it does
 *   For every `TicketAttachment` row in the database, it checks if the
 *   `storageKey` already exists in MinIO. If not, it reads the file from the
 *   legacy local directory (`TICKET_UPLOAD_DIR` or `./uploads/tickets`) and
 *   uploads it. Same for `DataExportRequest` rows whose status is `READY`.
 *
 *   Default mode is `--dry-run` (only counts files that would be migrated).
 *   Pass `--apply` to actually upload + (optionally) `--unlink-local` to
 *   delete the source file after a verified upload.
 *
 * Idempotent: re-running is safe. Files already in MinIO are skipped.
 *
 * USAGE
 *   pnpm --filter api cli:storage-migrate-from-fs
 *   pnpm --filter api cli:storage-migrate-from-fs -- --apply
 *   pnpm --filter api cli:storage-migrate-from-fs -- --apply --unlink-local
 */

import { existsSync } from 'fs';
import { readFile, stat, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import { Client as MinioClient } from 'minio';
import { PrismaClient } from '@verris/database';

interface CliOptions {
  apply: boolean;
  unlinkLocal: boolean;
}

interface BucketBinding {
  logical: 'TICKET_ATTACHMENTS' | 'DATA_EXPORTS';
  bucket: string;
  legacyRoot: string;
}

function parseArgs(): CliOptions {
  const apply = process.argv.includes('--apply');
  const unlinkLocal = process.argv.includes('--unlink-local');
  if (unlinkLocal && !apply) {
    throw new Error('--unlink-local requires --apply');
  }
  return { apply, unlinkLocal };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function buildClient(): MinioClient {
  const endpoint = requireEnv('S3_ENDPOINT');
  const useSsl = (process.env.S3_USE_SSL ?? 'false').toLowerCase() === 'true';
  let host = endpoint;
  let port: number | undefined;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    const url = new URL(endpoint);
    host = url.hostname;
    if (url.port) port = Number.parseInt(url.port, 10);
  } else if (endpoint.includes(':')) {
    const [h, p] = endpoint.split(':');
    host = h;
    const parsed = Number.parseInt(p, 10);
    if (Number.isFinite(parsed)) port = parsed;
  }
  return new MinioClient({
    endPoint: host,
    accessKey: requireEnv('S3_ACCESS_KEY'),
    secretKey: requireEnv('S3_SECRET_KEY'),
    useSSL: useSsl,
    region: process.env.S3_REGION ?? 'us-east-1',
    pathStyle: (process.env.S3_PATH_STYLE ?? 'true').toLowerCase() !== 'false',
    ...(port ? { port } : {}),
  });
}

async function objectExists(client: MinioClient, bucket: string, key: string): Promise<boolean> {
  try {
    await client.statObject(bucket, key);
    return true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'NotFound' || code === 'NoSuchKey') return false;
    throw err;
  }
}

async function migrateTicketAttachments(
  prisma: PrismaClient,
  client: MinioClient,
  binding: BucketBinding,
  opts: CliOptions,
): Promise<void> {
  const rows = await prisma.ticketAttachment.findMany({
    select: { id: true, storageKey: true, mimeType: true, originalName: true },
  });
  console.log(`[ticket-attachments] ${rows.length} row(s) in DB; legacy root = ${binding.legacyRoot}`);

  let toMigrate = 0;
  let migrated = 0;
  let alreadyInS3 = 0;
  let missingOnDisk = 0;

  for (const row of rows) {
    const inS3 = await objectExists(client, binding.bucket, row.storageKey);
    if (inS3) {
      alreadyInS3 += 1;
      continue;
    }
    const localPath = resolve(binding.legacyRoot, row.storageKey);
    if (!existsSync(localPath)) {
      missingOnDisk += 1;
      console.warn(`  skip(no-local): ${row.id} → ${row.storageKey}`);
      continue;
    }
    toMigrate += 1;

    if (!opts.apply) {
      console.log(`  would migrate: ${row.id} → ${row.storageKey}`);
      continue;
    }

    const buf = await readFile(localPath);
    await client.putObject(binding.bucket, row.storageKey, buf, buf.length, {
      'Content-Type': row.mimeType ?? 'application/octet-stream',
      'x-amz-meta-original-filename': row.originalName ?? 'attachment',
    });
    migrated += 1;
    console.log(`  migrated: ${row.id} → ${row.storageKey} (${buf.length} B)`);

    if (opts.unlinkLocal) {
      await unlink(localPath);
    }
  }

  console.log(
    `[ticket-attachments] summary: in-s3=${alreadyInS3}, missing-on-disk=${missingOnDisk}, ` +
      `to-migrate=${toMigrate}, migrated=${migrated}, mode=${opts.apply ? 'APPLY' : 'DRY-RUN'}`,
  );
}

async function migrateDataExports(
  prisma: PrismaClient,
  client: MinioClient,
  binding: BucketBinding,
  opts: CliOptions,
): Promise<void> {
  const rows = await prisma.dataExportRequest.findMany({
    where: { status: 'READY', storageKey: { not: null } },
    select: { id: true, storageKey: true, sizeBytes: true },
  });
  console.log(`[data-exports] ${rows.length} READY row(s); legacy root = ${binding.legacyRoot}`);

  let toMigrate = 0;
  let migrated = 0;
  let alreadyInS3 = 0;
  let missingOnDisk = 0;

  for (const row of rows) {
    const key = row.storageKey;
    if (!key) continue;
    const inS3 = await objectExists(client, binding.bucket, key);
    if (inS3) {
      alreadyInS3 += 1;
      continue;
    }
    const localPath = resolve(binding.legacyRoot, key);
    if (!existsSync(localPath)) {
      missingOnDisk += 1;
      console.warn(`  skip(no-local): ${row.id} → ${key}`);
      continue;
    }
    toMigrate += 1;

    if (!opts.apply) {
      console.log(`  would migrate: ${row.id} → ${key}`);
      continue;
    }

    const stats = await stat(localPath);
    await client.fPutObject(binding.bucket, key, localPath, {
      'Content-Type': 'application/zip',
    });
    migrated += 1;
    console.log(`  migrated: ${row.id} → ${key} (${stats.size} B)`);

    if (opts.unlinkLocal) {
      await unlink(localPath);
    }
  }

  console.log(
    `[data-exports] summary: in-s3=${alreadyInS3}, missing-on-disk=${missingOnDisk}, ` +
      `to-migrate=${toMigrate}, migrated=${migrated}, mode=${opts.apply ? 'APPLY' : 'DRY-RUN'}`,
  );
}

async function main(): Promise<void> {
  const opts = parseArgs();
  console.log(
    `Storage migration starting (mode=${opts.apply ? 'APPLY' : 'DRY-RUN'}, ` +
      `unlinkLocal=${opts.unlinkLocal})`,
  );

  const prisma = new PrismaClient();
  const client = buildClient();

  const ticketRoot =
    process.env.TICKET_UPLOAD_DIR ?? join(process.cwd(), 'uploads', 'tickets');
  const exportRoot =
    process.env.DATA_EXPORT_STORAGE_DIR ?? join(process.cwd(), 'storage', 'data-exports');

  try {
    await migrateTicketAttachments(
      prisma,
      client,
      {
        logical: 'TICKET_ATTACHMENTS',
        bucket: process.env.S3_BUCKET_TICKET_ATTACHMENTS ?? 'verris-ticket-attachments',
        legacyRoot: ticketRoot,
      },
      opts,
    );

    await migrateDataExports(
      prisma,
      client,
      {
        logical: 'DATA_EXPORTS',
        bucket: process.env.S3_BUCKET_DATA_EXPORTS ?? 'verris-data-exports',
        legacyRoot: exportRoot,
      },
      opts,
    );

    console.log('Done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
