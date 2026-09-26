import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** H-10/H-11 — podgląd archiwum kopii i odtworzenie pliku (zadanie FILE_RESTORE, env FR_*). */
export function loadFileRestoreScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-file-restore.sh'),
    join(process.cwd(), '../../ops/scripts/node-file-restore.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-file-restore.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-file-restore.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-file-restore.sh not found in monorepo');
}
