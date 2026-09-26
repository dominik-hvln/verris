import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** B-17/B-18/G-07 — blok ustawień Verris w .htaccess strony (zadanie HTACCESS, env HT_*). */
export function loadHtaccessScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-htaccess.sh'),
    join(process.cwd(), '../../ops/scripts/node-htaccess.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-htaccess.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-htaccess.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-htaccess.sh not found in monorepo');
}
