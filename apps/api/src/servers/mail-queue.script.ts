import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** F3.1 — kolejka poczty exima (zadanie MAIL_QUEUE, env MQ_*). */
export function loadMailQueueScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-mail-queue.sh'),
    join(process.cwd(), '../../ops/scripts/node-mail-queue.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-mail-queue.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-mail-queue.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-mail-queue.sh not found in monorepo');
}
