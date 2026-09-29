import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * CL-03: liczba + rzeczownik odmieniamy przez `plForm` z `@/lib/pl` — nie „3 plan(ów)”, „2 usług(i)”
 * ani ręczne `n === 1 ? "migracja" : "migracji"`, które gubią formę dla 2–4 i 22–24.
 */
const REGULY: Array<{ co: string; wzorzec: RegExp }> = [
  {
    co: 'końcówka w nawiasie po liczbie („3 plan(ów)”, "usług(i)")',
    wzorzec: /(?:\}|\d)\s+[a-ząćęłńóśźż]+\((?:ów|y|i|e|a|ek)\)|["'`][a-ząćęłńóśźż]+\((?:ów|y|i|e|a|ek)\)["'`]/,
  },
  { co: 'ręczna odmiana `n === 1 ? "…"`', wzorzec: /===\s*1\s*\?\s*["'`]/ },
];

function pliki(dir: string, wynik: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) pliki(p, wynik);
    else if (/\.tsx?$/.test(n) && !/\.spec\.tsx?$/.test(n)) wynik.push(p);
  }
  return wynik;
}

it.each(REGULY)('żaden plik panelu nie ma: $co', ({ wzorzec }) => {
  const trafienia = pliki(join(__dirname, '..'))
    .filter((p) => wzorzec.test(readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '')))
    .map((p) => p.split('/src/')[1]!);
  expect(trafienia).toEqual([]);
});
