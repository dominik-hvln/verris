import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** B-06 — konfiguracja PHP strony przez serwer WWW (zadanie PHP_INFO, env PI_*). */
export function loadPhpInfoScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-php-info.sh'),
    join(process.cwd(), '../../ops/scripts/node-php-info.sh'),
    join(__dirname, '../../../../../ops/scripts/node-php-info.sh'),
    join(__dirname, '../../../../ops/scripts/node-php-info.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-php-info.sh not found in monorepo');
}
