import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Deploy 12.10 padł na `next build` panelu klienta: plik „use server” (waf-actions.ts) eksportował stałą.
 * Next pozwala w takim pliku eksportować wyłącznie funkcje async (typy są wymazywane) — lint, typecheck i jest
 * tego nie widzą, wychodzi to dopiero przy budowie obrazu. Ten strażnik sprawdza każdy plik „use server” paneli.
 * https://nextjs.org/docs/app/api-reference/directives/use-server
 */
const KORZEN = resolve(import.meta.dirname, '../../../..');
const PANELE = ['apps/client-panel/src', 'apps/admin-panel/src', 'apps/staff-panel/src', 'apps/www/src'];

function pliki(kat: string): string[] {
  const wynik: string[] = [];
  let wpisy: string[];
  try {
    wpisy = readdirSync(kat);
  } catch {
    return wynik;
  }
  for (const w of wpisy) {
    if (w === 'node_modules' || w.startsWith('.')) continue;
    const p = join(kat, w);
    if (statSync(p).isDirectory()) wynik.push(...pliki(p));
    else if (/\.(ts|tsx)$/.test(w) && !/\.(spec|test)\.tsx?$/.test(w)) wynik.push(p);
  }
  return wynik;
}

/** Eksporty wartości, które nie są funkcją async — w pliku „use server” łamią `next build`. */
export function zleEksporty(tresc: string): string[] {
  const zle: string[] = [];
  for (const linia of tresc.split(/\r?\n/)) {
    if (/^export\s+(type|interface)\s/.test(linia)) continue;
    if (/^export\s+(default\s+)?async\s+function\b/.test(linia)) continue;
    if (/^export\s+(const|let|var|class|enum|function)\b/.test(linia) || /^export\s+default\s/.test(linia) || /^export\s+(\*|\{)/.test(linia)) {
      if (/^export\s+type\s+\{/.test(linia)) continue;
      zle.push(linia.trim().slice(0, 100));
    }
  }
  return zle;
}

describe('pliki „use server” w panelach eksportują tylko funkcje async', () => {
  it('stała w pliku „use server” jest wykrywana (przypadek z deployu 12.10)', () => {
    expect(zleEksporty("'use server';\nexport const BLAD = 'x';\nexport async function f() {}\nexport type T = 1;")).toEqual(["export const BLAD = 'x';"]);
  });

  it('żaden plik „use server” nie eksportuje stałych, klas ani funkcji synchronicznych', () => {
    const naruszenia: string[] = [];
    for (const panel of PANELE) {
      for (const p of pliki(join(KORZEN, panel))) {
        const tresc = readFileSync(p, 'utf-8');
        if (!/^\s*['"]use server['"];?/.test(tresc)) continue;
        for (const z of zleEksporty(tresc)) naruszenia.push(`${relative(KORZEN, p)}: ${z}`);
      }
    }
    expect(naruszenia).toEqual([]);
  });
});
