/**
 * Strażnik cen (decyzja 1.11.2026): ceny hostingu na verris.pl pochodzą z API (lib/ceny-api.ts → lib/ceny.ts),
 * nie z liczb wpisanych w kod. Zmiana cennika w adminie ma trafić na wszystkie strony bez wdrożenia.
 *
 * Test czerwieni się, gdy w kodzie strony, komponentu, tras tekstowych (llms.txt, llms-full.txt, pricing.md)
 * albo modułów lib (poza samym lib/ceny.ts, gdzie są wartości zapasowe) pojawi się wpisana ręcznie cena hostingu
 * („45 zł”, „449 zł”, „399 zł”, „36,59”, „365,04”), cena Kreatora Pro („9,90”, „99 zł”, „8,05”, „80,49”)
 * albo stawka autoskalowania („0,0882”, „0,001323”).
 * Treści z CMS (baza) nie są tu sprawdzane — to dane, nie kod.
 *
 * Lista WYJATKI jest pusta i ma taka zostać. Gdyby kiedyś trzeba było dopisać plik, w którym kwota nie jest ceną
 * Verris, każdy wpis musi mieć komentarz z uzasadnieniem — a drugi test pilnuje, żeby lista tylko malała.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** src/ — ścieżki w raportach są względem tego katalogu. */
const SRC = join(__dirname, '../..');
// Paczka 123: także abonament Kreator Pro (plan kreator-pro: 9,90 zł / 99 zł brutto, 8,05 zł / 80,49 zł netto).
const CENA_NA_SZTYWNO = /(?<![\d,])(45|449|399|99)(\s| )?zł|36,59|365,04|0,0882|0,001323|(?<![\d,])(9,90|8,05|80,49)(?!\d)/;

/** Ścieżki względem src/. */
const WYJATKI = new Set<string>([]);

const KOD = /\.tsx?$/;
const SPEC = /\.spec\.tsx?$/;

function pliki(dir: string, rekurencyjnie = true): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return rekurencyjnie ? pliki(p) : [];
    return KOD.test(n) && !SPEC.test(n) ? [relative(SRC, p)] : [];
  });
}

/** Wszystko, co trafia na verris.pl jako tekst dla klienta albo dla botów i asystentów AI. */
function zakres(): string[] {
  return [
    ...pliki(join(SRC, 'app/(frontend)')),
    ...pliki(join(SRC, 'app/llms.txt')),
    ...pliki(join(SRC, 'app/llms-full.txt')),
    ...pliki(join(SRC, 'app/pricing.md')),
    ...pliki(join(SRC, 'lib'), false).filter((f) => f !== join('lib', 'ceny.ts')),
  ];
}

describe('ceny z API, nie na sztywno', () => {
  const wszystkie = zakres();
  const zCena = wszystkie.filter((f) => CENA_NA_SZTYWNO.test(readFileSync(join(SRC, f), 'utf8')));

  it('zakres obejmuje strony, trasy tekstowe i moduły lib (poza lib/ceny.ts)', () => {
    expect(wszystkie).toEqual(
      expect.arrayContaining([
        join('app/(frontend)', 'cennik/page.tsx'),
        join('app/(frontend)', 'components/Pricing.tsx'),
        join('app/llms.txt', 'route.ts'),
        join('app/llms-full.txt', 'route.ts'),
        join('app/pricing.md', 'route.ts'),
        join('lib', 'poradniki.ts'),
        join('lib', 'schema.ts'),
      ]),
    );
    expect(wszystkie).not.toContain(join('lib', 'ceny.ts'));
  });

  it('wzorzec łapie ceny i stawki wpisane ręcznie, a nie łapie innych liczb', () => {
    for (const t of ['45 zł/mies', '449 zł', '399 zł/rok', '45 zł', '36,59 zł netto', '365,04', '0,0882 zł', '9,90 zł', '99 zł/rok', '8,05', '80,49 zł']) {
      expect(t).toMatch(CENA_NA_SZTYWNO);
    }
    for (const t of ['145 zł', '1449 zł', '44,90 zł', '9,45 zł', '45 GB', 'SLA 99,5%', '${zl(c.rocznie)}', '99,99 zł', '199 zł', '19,90 zł', '9,905']) {
      expect(t).not.toMatch(CENA_NA_SZTYWNO);
    }
  });

  it('żaden plik spoza listy wyjątków nie ma ceny hostingu wpisanej ręcznie', () => {
    expect(zCena.filter((f) => !WYJATKI.has(f))).toEqual([]);
  });

  it('lista wyjątków nie trzyma plików, które już przeszły na moduł cen (ma tylko maleć)', () => {
    expect([...WYJATKI].filter((f) => !zCena.includes(f))).toEqual([]);
  });
});
