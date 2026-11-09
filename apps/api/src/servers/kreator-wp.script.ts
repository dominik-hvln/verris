import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Znacznik w node-kreator-wp.sh, w miejsce którego wchodzi importer PHP (base64) – jeden podpisany skrypt. */
export const ZNACZNIK_IMPORTERA = '__VERRIS_KWP_IMPORTER_B64__';

function wczytaj(nazwa: string): string {
  const kandydaci = [
    join(process.cwd(), 'ops/scripts', nazwa),
    join(process.cwd(), '../../ops/scripts', nazwa),
    join(import.meta.dirname, '../../../../../ops/scripts', nazwa),
    join(import.meta.dirname, '../../../../ops/scripts', nazwa),
  ];
  for (const p of kandydaci) if (existsSync(p)) return readFileSync(p, 'utf8');
  throw new Error(`${nazwa} not found in monorepo`);
}

/**
 * Paczka 124 – skrypt zadania KREATOR_WP (env KWP_*): podgląd WordPressa z importem strony z kreatora, zamiana
 * i cofnięcie. Importer PHP (ops/scripts/node-kreator-wp-import.php) jest wklejony w skrypt jako base64, więc
 * podpis control-plane (PB-36) obejmuje oba pliki.
 */
export function loadKreatorWpScript(): string {
  const skrypt = wczytaj('node-kreator-wp.sh');
  if (skrypt.split(ZNACZNIK_IMPORTERA).length !== 2) throw new Error('node-kreator-wp.sh: brak znacznika importera');
  return skrypt.replace(ZNACZNIK_IMPORTERA, Buffer.from(wczytaj('node-kreator-wp-import.php'), 'utf8').toString('base64'));
}
