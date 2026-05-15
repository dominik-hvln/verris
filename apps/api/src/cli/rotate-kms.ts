/**
 * F-11 — APP_KMS_KEY rotation CLI.
 *
 * Re-encrypts every column we store under the application KMS key with a new
 * passphrase. The script reads `OLD_KMS_KEY` and `NEW_KMS_KEY` from the
 * environment, walks each affected table in chunks of 100 rows wrapped in a
 * single transaction, and writes a single audit log entry summarising the
 * result.
 *
 * Default mode is `--dry-run` (no writes) — pass `--apply` to actually flip
 * the data. Both keys must be at least 32 characters long, matching the
 * runtime validation in `apps/api/src/config/configuration.ts`.
 *
 * USAGE
 *   OLD_KMS_KEY=<old> NEW_KMS_KEY=<new> pnpm --filter api cli:rotate-kms
 *   OLD_KMS_KEY=<old> NEW_KMS_KEY=<new> pnpm --filter api cli:rotate-kms -- --apply
 *
 * IMPORTANT: the API process MUST be stopped before running with `--apply`
 * because it still holds the OLD key in memory and will keep writing fresh
 * ciphertexts under the OLD key, racing this script. See DEPLOY.md for the
 * full procedure (maintenance window → rotate → restart with NEW_KMS_KEY).
 */

import { Prisma, PrismaClient } from '@verris/database';
import { CryptoService } from '../common/crypto/crypto.service';

const CHUNK_SIZE = 100;

type TxClient = Prisma.TransactionClient;

interface RotationOptions {
  dryRun: boolean;
}

interface ColumnSpec {
  table: string;
  /** Human-readable column path, e.g. `User.twoFactorSecret`. */
  column: string;
  /**
   * Pulls the next batch of rows that still need re-encryption. Implementations
   * MUST return `id` and the encrypted value; results are sorted by `id` and
   * paginated via the cursor returned by previous calls.
   */
  fetchBatch(
    prisma: PrismaClient,
    cursorId: string | null,
  ): Promise<Array<{ id: string; value: string | null }>>;
  /** Persists the freshly encrypted ciphertext for one row (inside a tx). */
  applyUpdate(tx: TxClient, id: string, nextValue: string): Promise<void>;
}

interface ColumnResult {
  column: string;
  scanned: number;
  rotated: number;
  skipped: number;
  errors: Array<{ id: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Column registry — every column persisted under APP_KMS_KEY must be listed
// here so the rotation is exhaustive. Adding a new encrypted column? Add a
// row here and re-run the CLI in dry-run to verify the count.
// ---------------------------------------------------------------------------

const COLUMNS: ColumnSpec[] = [
  {
    table: 'Server',
    column: 'Server.daPasswordEnc',
    async fetchBatch(prisma, cursorId) {
      const rows = await prisma.server.findMany({
        where: { daPasswordEnc: { not: null } },
        orderBy: { id: 'asc' },
        take: CHUNK_SIZE,
        ...(cursorId
          ? { skip: 1, cursor: { id: cursorId } }
          : {}),
        select: { id: true, daPasswordEnc: true },
      });
      return rows.map((r) => ({ id: r.id, value: r.daPasswordEnc }));
    },
    async applyUpdate(tx, id, nextValue) {
      await tx.server.update({
        where: { id },
        data: { daPasswordEnc: nextValue },
      });
    },
  },
  {
    table: 'Account',
    column: 'Account.daPasswordEnc',
    async fetchBatch(prisma, cursorId) {
      const rows = await prisma.account.findMany({
        where: { daPasswordEnc: { not: null } },
        orderBy: { id: 'asc' },
        take: CHUNK_SIZE,
        ...(cursorId
          ? { skip: 1, cursor: { id: cursorId } }
          : {}),
        select: { id: true, daPasswordEnc: true },
      });
      return rows.map((r) => ({ id: r.id, value: r.daPasswordEnc }));
    },
    async applyUpdate(tx, id, nextValue) {
      await tx.account.update({
        where: { id },
        data: { daPasswordEnc: nextValue },
      });
    },
  },
  {
    table: 'User',
    column: 'User.twoFactorSecret',
    async fetchBatch(prisma, cursorId) {
      const rows = await prisma.user.findMany({
        where: { twoFactorSecret: { not: null } },
        orderBy: { id: 'asc' },
        take: CHUNK_SIZE,
        ...(cursorId
          ? { skip: 1, cursor: { id: cursorId } }
          : {}),
        select: { id: true, twoFactorSecret: true },
      });
      return rows.map((r) => ({ id: r.id, value: r.twoFactorSecret }));
    },
    async applyUpdate(tx, id, nextValue) {
      await tx.user.update({
        where: { id },
        data: { twoFactorSecret: nextValue },
      });
    },
  },
  {
    table: 'User',
    column: 'User.twoFactorRecoveryCodesEnc',
    async fetchBatch(prisma, cursorId) {
      const rows = await prisma.user.findMany({
        where: { twoFactorRecoveryCodesEnc: { not: null } },
        orderBy: { id: 'asc' },
        take: CHUNK_SIZE,
        ...(cursorId
          ? { skip: 1, cursor: { id: cursorId } }
          : {}),
        select: { id: true, twoFactorRecoveryCodesEnc: true },
      });
      return rows.map((r) => ({ id: r.id, value: r.twoFactorRecoveryCodesEnc }));
    },
    async applyUpdate(tx, id, nextValue) {
      await tx.user.update({
        where: { id },
        data: { twoFactorRecoveryCodesEnc: nextValue },
      });
    },
  },
];

// ---------------------------------------------------------------------------
// Argv / env parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): RotationOptions {
  let dryRun = true;
  let explicit = false;
  for (const arg of argv) {
    if (arg === '--apply') {
      dryRun = false;
      explicit = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
      explicit = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      console.error(`Unknown flag: ${arg}`);
      printUsage();
      process.exit(2);
    }
  }
  if (!explicit) {
    console.warn(
      '[rotate-kms] No mode specified — defaulting to --dry-run (no writes). ' +
        'Pass --apply to actually rotate.',
    );
  }
  return { dryRun };
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage: pnpm --filter api cli:rotate-kms [-- --apply | --dry-run]',
      '',
      'Environment variables:',
      '  OLD_KMS_KEY  Current passphrase (≥32 chars). Required.',
      '  NEW_KMS_KEY  New passphrase (≥32 chars). Required.',
      '',
      'Modes:',
      '  --dry-run    (default) Decrypt every value with OLD_KMS_KEY but DO NOT',
      '               write any ciphertexts back. Reports counts per table.',
      '  --apply      Re-encrypt every value with NEW_KMS_KEY. Writes are done',
      '               in batches of 100 inside a single transaction per batch.',
      '',
      'Audit log: a single AuditLog row is recorded with action=KMS_KEY_ROTATED',
      '           summarising rows touched per table and dry-run flag.',
      '',
    ].join('\n'),
  );
}

function readKey(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters (got ${value.length})`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

async function rotateColumn(
  prisma: PrismaClient,
  spec: ColumnSpec,
  oldKey: Buffer,
  newKey: Buffer,
  options: RotationOptions,
): Promise<ColumnResult> {
  const result: ColumnResult = {
    column: spec.column,
    scanned: 0,
    rotated: 0,
    skipped: 0,
    errors: [],
  };

  let cursor: string | null = null;
  while (true) {
    const batch = await spec.fetchBatch(prisma, cursor);
    if (batch.length === 0) break;

    const reencrypted: Array<{ id: string; nextValue: string }> = [];

    for (const row of batch) {
      result.scanned += 1;
      if (!row.value) {
        result.skipped += 1;
        continue;
      }
      try {
        const plaintext = CryptoService.decryptWithKey(row.value, oldKey);
        const nextCiphertext = CryptoService.encryptWithKey(plaintext, newKey);

        // Sanity check: the round-trip must yield the same plaintext under
        // the new key. Cheap protection against any future regression in
        // the helpers.
        const verify = CryptoService.decryptWithKey(nextCiphertext, newKey);
        if (verify !== plaintext) {
          throw new Error('round-trip verification failed');
        }
        reencrypted.push({ id: row.id, nextValue: nextCiphertext });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push({ id: row.id, error: msg });
      }
    }

    if (!options.dryRun && reencrypted.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const item of reencrypted) {
          await spec.applyUpdate(tx, item.id, item.nextValue);
        }
      });
    }

    result.rotated += reencrypted.length;
    cursor = batch[batch.length - 1].id;

    // If the batch was smaller than CHUNK_SIZE, we've reached the end.
    if (batch.length < CHUNK_SIZE) break;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const oldRaw = readKey('OLD_KMS_KEY');
  const newRaw = readKey('NEW_KMS_KEY');
  if (oldRaw === newRaw) {
    throw new Error('OLD_KMS_KEY and NEW_KMS_KEY must differ');
  }

  const oldKey = CryptoService.deriveKey(oldRaw);
  const newKey = CryptoService.deriveKey(newRaw);

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();

    const start = Date.now();
    const results: ColumnResult[] = [];
    for (const spec of COLUMNS) {
      console.log(`[rotate-kms] Processing ${spec.column}…`);
      const r = await rotateColumn(prisma, spec, oldKey, newKey, options);
      results.push(r);
      console.log(
        `[rotate-kms] ${spec.column}: scanned=${r.scanned} rotated=${r.rotated} skipped=${r.skipped} errors=${r.errors.length}`,
      );
      if (r.errors.length > 0) {
        for (const e of r.errors.slice(0, 5)) {
          console.error(`  - id=${e.id}: ${e.error}`);
        }
        if (r.errors.length > 5) {
          console.error(`  …and ${r.errors.length - 5} more`);
        }
      }
    }
    const elapsedMs = Date.now() - start;

    const totalRotated = results.reduce((s, r) => s + r.rotated, 0);
    const totalScanned = results.reduce((s, r) => s + r.scanned, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    console.log('\n[rotate-kms] Summary:');
    console.log(`  mode:           ${options.dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);
    console.log(`  total scanned:  ${totalScanned}`);
    console.log(`  total rotated:  ${totalRotated}`);
    console.log(`  total errors:   ${totalErrors}`);
    console.log(`  elapsed:        ${elapsedMs}ms`);

    // Audit even dry runs — operators want a paper trail of every attempt.
    await prisma.auditLog.create({
      data: {
        action: 'KMS_KEY_ROTATED',
        userId: null,
        actorUserId: null,
        details: {
          dryRun: options.dryRun,
          elapsedMs,
          totalScanned,
          totalRotated,
          totalErrors,
          tables: results.map((r) => ({
            column: r.column,
            scanned: r.scanned,
            rotated: r.rotated,
            skipped: r.skipped,
            errors: r.errors.length,
          })),
        },
      },
    });

    if (totalErrors > 0) {
      console.error(
        `[rotate-kms] Completed with ${totalErrors} errors — investigate before deploying NEW_KMS_KEY.`,
      );
      process.exitCode = 1;
    } else if (options.dryRun) {
      console.log('[rotate-kms] Dry run successful. Re-run with --apply to commit.');
    } else {
      console.log('[rotate-kms] Rotation complete. Restart the API with NEW_KMS_KEY now.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[rotate-kms] Fatal:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
