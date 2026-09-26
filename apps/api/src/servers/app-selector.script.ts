import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** B-08/B-09 — aplikacje Node.js / Python przez CloudLinux Selector (zadanie APP_SELECTOR, env AS_*). */
export function loadAppSelectorScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-app-selector.sh'),
    join(process.cwd(), '../../ops/scripts/node-app-selector.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-app-selector.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-app-selector.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-app-selector.sh not found in monorepo');
}
