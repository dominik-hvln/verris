import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** F3.4 — usługi i logi węzła z białej listy (zadanie NODE_SERVICES, env SVC_*). */
export function loadServicesScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-services.sh'),
    join(process.cwd(), '../../ops/scripts/node-services.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-services.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-services.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-services.sh not found in monorepo');
}
