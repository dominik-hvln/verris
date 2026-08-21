import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** B5 — loads the canonical staging sync bash script. */
export function loadStagingSyncScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-staging-sync.sh'),
    join(process.cwd(), '../../ops/scripts/node-staging-sync.sh'),
    join(__dirname, '../../../../../ops/scripts/node-staging-sync.sh'),
    join(__dirname, '../../../../ops/scripts/node-staging-sync.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error('node-staging-sync.sh not found in monorepo');
}
