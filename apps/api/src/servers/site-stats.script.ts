import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** PB-19 — technologia, ruch 7 dni, 5xx i TTFB strony (zadanie SITE_STATS, env SS_*). */
export function loadSiteStatsScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-site-stats.sh'),
    join(process.cwd(), '../../ops/scripts/node-site-stats.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-site-stats.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-site-stats.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-site-stats.sh not found in monorepo');
}
