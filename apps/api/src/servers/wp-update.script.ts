import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** I-04/I-05 — sprawdzenie i aktualizacja WordPressa domeny (zadanie WP_UPDATE, env WPU_*). */
export function loadWpUpdateScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-wp-update.sh'),
    join(process.cwd(), '../../ops/scripts/node-wp-update.sh'),
    join(__dirname, '../../../../../ops/scripts/node-wp-update.sh'),
    join(__dirname, '../../../../ops/scripts/node-wp-update.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-wp-update.sh not found in monorepo');
}
