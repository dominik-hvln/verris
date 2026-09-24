/**
 * PB-16 — strażnik skórki `.v2-skin`.
 *
 * Starsze ekrany panelu mają zaszyte klasy ciemnej palety (text-white, bg-black, border-white/10,
 * bg-[#0a0a0a]…). Nie przepisujemy ich plik po pliku — `.v2-skin` w globals.css mapuje je na tokeny
 * wzorca, dzięki czemu działają w obu motywach. Ten test pilnuje, żeby żadna NOWA klasa tej palety
 * nie weszła do ekranów panelu bez mapowania (inaczej w jasnym motywie zostaje czarne pole albo
 * biały tekst na jasnym tle).
 *
 * Nowy kod piszemy od razu na tokenach (text-foreground, bg-card, border-line…) — wtedy tego testu
 * nie dotyczy. Jeśli stara klasa jest naprawdę potrzebna dosłownie (np. białe tło pod kodem QR),
 * użyj wartości jawnej: bg-[#ffffff].
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..');
const CSS = readFileSync(join(SRC, 'app/globals.css'), 'utf8');

// Katalogi renderowane wewnątrz `.v2-skin` (layout panelu). Strony logowania i baner cookies
// leżą poza nim i mają własny wygląd.
const KATALOGI = ['app/dashboard', 'components/hosting', 'components/panel'];

const KLASA =
  /(?<![\w-])((?:[a-z-]+:)*)(bg|text|border|divide|ring|fill)-(white|black|neutral-\d{2,3}|\[#[0-9a-fA-F]{3,8}\])(\/(?:\d+|\[[\d.]+\]))?(?![\w\-\/\[])/g;

function pliki(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pliki(p);
    return /\.tsx$/.test(n) && !/\.spec\./.test(n) ? [p] : [];
  });
}

const esc = (s: string) => s.replace(/[:/[\]#.]/g, (c) => `\\${c}`);

// Wartości celowo dosłowne: białe tło pod QR / podgląd strony, podglądy odznak w obu motywach.
const JAWNE = new Set(['bg-[#ffffff]', 'bg-[#F4F4EE]', 'bg-[#16211B]', 'border-neutral-300']);

const escRe = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

function zmapowana(klasa: string): boolean {
  // Selektor może być złożony (np. `.v2-skin .fixed.inset-0.bg-black\/80` dla nakładek).
  return new RegExp(`\\.v2-skin [^{,]*\\.${escRe(esc(klasa))}(?![\\w-])`).test(CSS);
}

describe('PB-16 — stara paleta w panelu ma mapowanie w .v2-skin', () => {
  it('każda klasa ciemnej palety użyta w panelu jest przemapowana na tokeny', () => {
    const braki = new Map<string, string>();
    for (const dir of KATALOGI) {
      for (const plik of pliki(join(SRC, dir))) {
        const tresc = readFileSync(plik, 'utf8');
        for (const m of tresc.matchAll(KLASA)) {
          const warianty = m[1];
          if (warianty.includes('dark:') || warianty.includes('group-') || warianty.includes('peer-')) continue;
          const klasa = m[0];
          if (!JAWNE.has(klasa) && !zmapowana(klasa) && !braki.has(klasa)) braki.set(klasa, relative(SRC, plik));
        }
      }
    }
    expect([...braki].map(([k, p]) => `${k}  (${p})`)).toEqual([]);
  });

  it('mapowanie nie zamienia białego tła pod kodem QR 2FA na kolor akcentu', () => {
    const qr = readFileSync(join(SRC, 'app/dashboard/settings/two-factor-section.tsx'), 'utf8');
    expect(qr).toContain('bg-[#ffffff] p-3');
  });
});
