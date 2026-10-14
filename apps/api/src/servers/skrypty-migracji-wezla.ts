import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 14.10 — worker migracji (node-migration-worker.sh) i jego biblioteka walidacji wejścia trafiały na węzeł
 * tylko przy wdrażaniu węzła (node-onboard-live.sh → --install). Poprawki workera (np. sprawdzanie domeny
 * docelowej, migracja stron spoza WordPressa) nie docierały na działające węzły. Teraz instalator agenta
 * (także w aktualizacji floty) pobiera oba pliki z API, podpisane jak reszta skryptów (verris-fetch).
 */
const PLIKI = {
  worker: 'node-migration-worker.sh',
  guard: 'lib/migration-input-guard.sh',
} as const;
export type SkryptMigracji = keyof typeof PLIKI;

export function wczytajSkryptMigracji(ktory: SkryptMigracji): string {
  const rel = PLIKI[ktory];
  const kandydaci = [
    join(process.cwd(), 'ops/scripts', rel),
    join(process.cwd(), '../../ops/scripts', rel),
    join(import.meta.dirname, '../../../../../ops/scripts', rel),
    join(import.meta.dirname, '../../../../ops/scripts', rel),
  ];
  for (const p of kandydaci) if (existsSync(p)) return readFileSync(p, 'utf8');
  throw new Error(`${rel} not found in monorepo`);
}
