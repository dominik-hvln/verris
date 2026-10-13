import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * CLAUDE.md: liczebniki w tekstach dla klienta odmieniamy przez `plForm` (1 / 2–4 / 5+). Ręczne „n === 1 ? 'x' : 'y'”
 * gubi formę 2–4 — przegląd produkcji 13.10 znalazł „2 skrzynek”, „3 wpisów”, „2 lat”, „3 usług”.
 * Wzorzec łapie dwie formy, z których druga jest dopełniaczem liczby mnogiej (-ów, -ek, -ug, lat).
 */
it('żaden plik panelu nie odmienia liczebnika ręcznie „=== 1 ? … : …ów/ek/ug/lat”', () => {
  const trafienia: string[] = [];
  const przejdz = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (/\.tsx?$/.test(n) && !/\.spec\.tsx?$/.test(n)) {
        const kod = readFileSync(p, 'utf8');
        if (/=== 1 \? '[^']+' : '[^']*(ów|ek|ug|lat)'/.test(kod)) trafienia.push(p.split('/src/')[1]!);
      }
    }
  };
  przejdz(join(__dirname, '..'));
  expect(trafienia).toEqual([]);
});
