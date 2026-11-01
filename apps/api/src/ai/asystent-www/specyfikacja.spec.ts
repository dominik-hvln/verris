import { readFileSync } from 'node:fs';
import { SPECYFIKACJA } from './specyfikacja.js';

/**
 * Asystent opisuje pakiet kopią specyfikacji ze strony (API nie importuje z www). Gdy ktoś zmieni specyfikację na
 * verris.pl, a nie kopię (albo odwrotnie), ten test pada — asystent nie może mówić czegoś innego niż strona.
 */
describe('specyfikacja asystenta = specyfikacja na verris.pl', () => {
  const www = readFileSync(new URL('../../../../www/src/lib/specyfikacja.ts', import.meta.url), 'utf8');
  /** Wiersze ['parametr', 'wartość'] z pliku www (literały w apostrofach albo cudzysłowach). */
  const wierszeWww = [...www.matchAll(/\[\s*(['"])((?:(?!\1).)+)\1\s*,\s*(['"])((?:(?!\3).)+)\3/g)].map((m) => [m[2], m[4]]);
  const STAWKI = 'Stawki autoskalowania';

  it('każdy wiersz kopii (poza stawkami z cennika) jest na stronie', () => {
    const naStronie = new Set(wierszeWww.map(([p, w]) => `${p}|${w}`));
    const kopia = SPECYFIKACJA.flatMap((s) => s.wiersze).filter(([p]) => p !== STAWKI);
    expect(kopia.filter(([p, w]) => !naStronie.has(`${p}|${w}`))).toEqual([]);
  });

  it('każdy wiersz strony jest w kopii', () => {
    const wKopii = new Set(SPECYFIKACJA.flatMap((s) => s.wiersze).map(([p, w]) => `${p}|${w}`));
    expect(wierszeWww.length).toBeGreaterThan(30);
    expect(wierszeWww.filter(([p, w]) => !wKopii.has(`${p}|${w}`))).toEqual([]);
  });

  it('sekcje mają te same id co kotwice na /specyfikacja', () => {
    for (const s of SPECYFIKACJA) expect(www).toContain(`id: '${s.id}'`);
  });
});
