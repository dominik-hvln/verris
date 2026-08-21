import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** A4 — loads the canonical WordPress installer bash script from the monorepo. */
export function loadWpInstallScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-wp-install.sh'),
    join(process.cwd(), '../../ops/scripts/node-wp-install.sh'),
    join(__dirname, '../../../../../ops/scripts/node-wp-install.sh'),
    join(__dirname, '../../../../ops/scripts/node-wp-install.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error('node-wp-install.sh not found in monorepo');
}
