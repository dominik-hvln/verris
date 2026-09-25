import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** D-16 — Memcached konta (zadanie MEMCACHED_ACCESS, env MC_*). */
export function loadMemcachedScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-memcached.sh'),
    join(process.cwd(), '../../ops/scripts/node-memcached.sh'),
    join(__dirname, '../../../../../ops/scripts/node-memcached.sh'),
    join(__dirname, '../../../../ops/scripts/node-memcached.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-memcached.sh not found in monorepo');
}
