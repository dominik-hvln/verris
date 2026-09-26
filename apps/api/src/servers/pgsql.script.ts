import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** D-14 — bazy PostgreSQL konta (zadanie PGSQL, env PG_*). */
export function loadPgsqlScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-pgsql.sh'),
    join(process.cwd(), '../../ops/scripts/node-pgsql.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-pgsql.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-pgsql.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-pgsql.sh not found in monorepo');
}
