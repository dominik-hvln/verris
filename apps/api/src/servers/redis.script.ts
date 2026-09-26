import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** D-15/J-03 — Redis konta (zadanie REDIS_ACCESS, env RD_*). */
export function loadRedisScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-redis.sh'),
    join(process.cwd(), '../../ops/scripts/node-redis.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-redis.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-redis.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-redis.sh not found in monorepo');
}
