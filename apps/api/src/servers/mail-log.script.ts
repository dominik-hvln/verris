import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** E-19 — dziennik dostarczania poczty (zadanie MAIL_LOG, env ML_*). */
export function loadMailLogScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-mail-log.sh'),
    join(process.cwd(), '../../ops/scripts/node-mail-log.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-mail-log.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-mail-log.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-mail-log.sh not found in monorepo');
}
