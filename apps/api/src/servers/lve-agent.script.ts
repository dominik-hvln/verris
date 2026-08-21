import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Loads the canonical node LVE agent bash script from the monorepo / image. */
export function loadLveAgentScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/verris-lve.sh'),
    join(process.cwd(), '../../ops/scripts/verris-lve.sh'),
    join(__dirname, '../../../../../ops/scripts/verris-lve.sh'),
    join(__dirname, '../../../../ops/scripts/verris-lve.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error('verris-lve.sh not found in monorepo');
}
