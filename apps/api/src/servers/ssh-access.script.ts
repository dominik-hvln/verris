import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** C-21/C-22 — SSH w klatce CageFS i klucze (zadanie SSH_ACCESS, env SSH_*). */
export function loadSshAccessScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-ssh-access.sh'),
    join(process.cwd(), '../../ops/scripts/node-ssh-access.sh'),
    join(__dirname, '../../../../../ops/scripts/node-ssh-access.sh'),
    join(__dirname, '../../../../ops/scripts/node-ssh-access.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-ssh-access.sh not found in monorepo');
}
