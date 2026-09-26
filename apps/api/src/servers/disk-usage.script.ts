import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** C-15/K-03 — zajętość katalogów konta (zadanie DISK_USAGE, env DU_*). */
export function loadDiskUsageScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-disk-usage.sh'),
    join(process.cwd(), '../../ops/scripts/node-disk-usage.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-disk-usage.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-disk-usage.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-disk-usage.sh not found in monorepo');
}
