import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** F3.2 (D5) — blokady IP fail2ban na węźle (zadanie IP_BLOCKS, env IPB_*). */
export function loadIpBlocksScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-ip-blocks.sh'),
    join(process.cwd(), '../../ops/scripts/node-ip-blocks.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-ip-blocks.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-ip-blocks.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-ip-blocks.sh not found in monorepo');
}
