import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** I-13 — kopia strony na inną domenę konta (zadanie SITE_CLONE, env SC_*). */
export function loadSiteCloneScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-site-clone.sh'),
    join(process.cwd(), '../../ops/scripts/node-site-clone.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-site-clone.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-site-clone.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-site-clone.sh not found in monorepo');
}
