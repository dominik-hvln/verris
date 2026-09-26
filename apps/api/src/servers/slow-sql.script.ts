import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** K-14 — wolne zapytania SQL baz konta (zadanie SLOW_SQL, env SQ_*). */
export function loadSlowSqlScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-slow-sql.sh'),
    join(process.cwd(), '../../ops/scripts/node-slow-sql.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-slow-sql.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-slow-sql.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-slow-sql.sh not found in monorepo');
}
