import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** P-3 — loads the canonical 1-click app installer script. */
export function loadAppInstallScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-app-install.sh'),
    join(process.cwd(), '../../ops/scripts/node-app-install.sh'),
    join(__dirname, '../../../../../ops/scripts/node-app-install.sh'),
    join(__dirname, '../../../../ops/scripts/node-app-install.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-app-install.sh not found in monorepo');
}
