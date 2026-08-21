import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * S-1 — loads the canonical off-site account restore script. The node agent
 * runs it in ENV mode (OFR_MODE=list|fetch, OFR_USER, OFR_ARCHIVE, OFR_SNAPSHOT)
 * for the OFFSITE_RESTORE task kind; the same file stays usable as an ops CLI.
 */
export function loadOffsiteRestoreScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-account-restore.sh'),
    join(process.cwd(), '../../ops/scripts/node-account-restore.sh'),
    join(__dirname, '../../../../../ops/scripts/node-account-restore.sh'),
    join(__dirname, '../../../../ops/scripts/node-account-restore.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error('node-account-restore.sh not found in monorepo');
}
