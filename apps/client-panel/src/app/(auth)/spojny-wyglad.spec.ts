import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * 14.10 (Dominik): /register i /forgot-password nie wyglądały jak logowanie — stara ciemna paleta
 * (neutral-950, sky-*, text-white), inny przycisk, brak wzoru marki, w jasnym motywie czarna karta.
 * Strony bez sesji mają jeden wygląd: logowanie (własna Shell z ekranem 2FA) i wspólna AuthShell
 * (components/auth-shell.tsx) dla pozostałych; kolory tylko z tokenów panelu.
 */
const AUTH = __dirname;

function strony(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return strony(p);
    return n === 'page.tsx' ? [p] : [];
  });
}

const STARA_PALETA = /(?<![\w-])(?:bg|text|border|ring|from|to|via)-(?:neutral|zinc|gray|slate|sky|emerald|rose)-\d{2,3}|(?<![\w-])(?:text|bg|border)-(?:white|black)(?![\w-])|bg-\[#0a0a0a\]/g;

describe('strony bez logowania — wygląd panelu', () => {
  const wszystkie = strony(AUTH);

  it.each(wszystkie.map((p) => relative(AUTH, p)))('%s: kolory tylko z tokenów (bez starej palety)', (rel) => {
    const tresc = readFileSync(join(AUTH, rel), 'utf8');
    expect(tresc.match(STARA_PALETA) ?? []).toEqual([]);
  });

  it.each(wszystkie.filter((p) => !p.includes(`${'login'}/`)).map((p) => relative(AUTH, p)))(
    '%s: wspólna AuthShell (logo, wzór marki, karta jak przy logowaniu)',
    (rel) => {
      expect(readFileSync(join(AUTH, rel), 'utf8')).toMatch(/<AuthShell[\s>]/);
    },
  );
});
