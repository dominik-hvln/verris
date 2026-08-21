import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** P-6 — loads the canonical per-account PHP version apply script. */
export function loadPhpApplyScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-php-apply.sh'),
    join(process.cwd(), '../../ops/scripts/node-php-apply.sh'),
    join(__dirname, '../../../../../ops/scripts/node-php-apply.sh'),
    join(__dirname, '../../../../ops/scripts/node-php-apply.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error('node-php-apply.sh not found in monorepo');
}
