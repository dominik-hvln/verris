import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Panel nie pokazuje systemowych kontrolek przeglądarki — wyglądają inaczej w każdej przeglądarce,
 * odstają od motywu, a okna confirm/prompt na telefonie zasłaniają cały ekran. Decyzja właściciela
 * 2026-09-24. Zamienniki: `Select` (`@/components/select`); pola daty ani okien systemowych ten panel dziś nie ma —
 * przy pierwszej potrzebie przenieść `PoleDaty` i `potwierdz` z panelu admina.
 */
const REGULY: Array<{ co: string; wzorzec: RegExp }> = [
  { co: 'natywny <select>', wzorzec: /<select[\s>]/ },
  { co: 'natywne pole daty/czasu', wzorzec: /type=["'](?:date|datetime-local|time|month|week)["']/ },
  { co: 'systemowe okno confirm/prompt/alert', wzorzec: /(?<![\w.])(?:window\.)?(?:confirm|prompt|alert)\(/ },
];

function pliki(dir: string, wynik: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) pliki(p, wynik);
    else if (/\.tsx?$/.test(n) && !n.endsWith('.spec.ts')) wynik.push(p);
  }
  return wynik;
}

it.each(REGULY)('żaden plik panelu nie używa: $co', ({ wzorzec }) => {
  const trafienia = pliki(join(__dirname, '..'))
    .filter((p) => wzorzec.test(readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '')))
    .map((p) => p.split('/src/')[1]!);
  expect(trafienia).toEqual([]);
});

/** Widoczne `<input type="file">` pokazuje systemowe „Choose files / No file chosen” (po angielsku). */
it('żaden plik panelu nie pokazuje systemowego wyboru plików', () => {
  const trafienia: string[] = [];
  const przejdz = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (n.endsWith('.tsx')) {
        const pola = readFileSync(p, 'utf8').match(/<input\b[^>]*?type=["']file["'][^>]*>/gs) ?? [];
        if (pola.some((t) => !/\bhidden\b|sr-only/.test(t))) trafienia.push(p.split('/src/')[1]!);
      }
    }
  };
  przejdz(join(__dirname, '..'));
  expect(trafienia).toEqual([]);
});
