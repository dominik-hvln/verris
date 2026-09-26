import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** J-06 — optymalizacja obrazów strony (zadanie IMAGE_OPTIMIZE, env IO_*). */
export function loadImageOptimizeScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-image-optimize.sh'),
    join(process.cwd(), '../../ops/scripts/node-image-optimize.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-image-optimize.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-image-optimize.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-image-optimize.sh not found in monorepo');
}
