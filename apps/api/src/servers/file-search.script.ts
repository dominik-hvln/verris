import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** C-14 — wyszukiwanie plików w katalogu strony (zadanie FILE_SEARCH, env FS_*). */
export function loadFileSearchScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-file-search.sh'),
    join(process.cwd(), '../../ops/scripts/node-file-search.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-file-search.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-file-search.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-file-search.sh not found in monorepo');
}
