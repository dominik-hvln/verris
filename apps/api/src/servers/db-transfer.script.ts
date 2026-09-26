import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** D-12 — skrypt eksportu/importu bazy klienta (zadanie DB_TRANSFER, env DBT_*). */
export function loadDbTransferScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-db-transfer.sh'),
    join(process.cwd(), '../../ops/scripts/node-db-transfer.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-db-transfer.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-db-transfer.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-db-transfer.sh not found in monorepo');
}
