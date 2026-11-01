/**
 * Strażnik cen (decyzja 1.11.2026): ceny hostingu na verris.pl pochodzą z API (lib/ceny-api.ts → lib/ceny.ts),
 * nie z liczb wpisanych w kod. Zmiana cennika w adminie ma trafić na wszystkie strony bez wdrożenia.
 *
 * Test czerwieni się, gdy w pliku strony albo komponentu pojawi się wpisana ręcznie cena hostingu
 * („45 zł”, „449 zł”, „399 zł”, „36,59”, „365,04”). Pliki z listy WYJATKI jeszcze nie przeszły na moduł cen —
 * lista ma tylko maleć. Gdy plik przestaje mieć ceny na sztywno, test każe go z listy usunąć.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIR = __dirname;
const CENA_NA_SZTYWNO = /(?<![\d,])(45|449|399)(\s| )?zł|36,59|365,04/;

/** Ścieżki względem app/(frontend). */
const WYJATKI = new Set([
  // Poza zakresem paczki 1.11 — do przepisania w kolejnych:
  'layout.tsx',
  'blog/[slug]/page.tsx',
  'blog/page.tsx',
  'cennik/page.tsx',
  'components/AZamowienie.tsx',
  'components/Footer.tsx',
  'components/Pricing.tsx',
  'funkcje/kopie-zapasowe/page.tsx',
  'funkcje/page.tsx',
  'funkcje/statystyki/page.tsx',
  'hosting/sklep/page.tsx',
  'hosting/wordpress/page.tsx',
  'jak-wybrac-hosting/page.tsx',
  'polecaj/page.tsx',
  'specyfikacja/page.tsx',
  'zamow/page.tsx',
]);

function pliki(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pliki(p);
    return /\.tsx?$/.test(n) && !/\.spec\.tsx?$/.test(n) ? [relative(DIR, p)] : [];
  });
}

describe('ceny z API, nie na sztywno', () => {
  const wszystkie = pliki(DIR);
  const zCena = wszystkie.filter((f) => CENA_NA_SZTYWNO.test(readFileSync(join(DIR, f), 'utf8')));

  it('żaden plik spoza listy wyjątków nie ma ceny hostingu wpisanej ręcznie', () => {
    expect(zCena.filter((f) => !WYJATKI.has(f))).toEqual([]);
  });

  it('lista wyjątków nie trzyma plików, które już przeszły na moduł cen (ma tylko maleć)', () => {
    expect([...WYJATKI].filter((f) => !zCena.includes(f))).toEqual([]);
  });
});
