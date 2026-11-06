import { readFileSync, readdirSync, statSync } from 'fs';
import { extname, join, relative } from 'path';
import ts from 'typescript';

/**
 * Decyzja Dominika z 6.11.2026: pauza „—” (U+2014) w tekstach dla ludzi jest „typowa dla AI” — piszemy
 * półpauzę „–” (U+2013) ze spacjami wokół („16 scenariuszy – 14 obowiązkowych”), także jako znak pustej
 * wartości w tabelach.
 *
 * Strażnik przechodzi po źródłach www, paneli, strony statusu, API i bibliotek z tekstami (contracts, ui)
 * i szuka pauzy w literałach tekstowych: '…', "…", `…` i tekście JSX. Komentarze się nie liczą (to nie są
 * węzły drzewa składni). Testy (*.spec.*, katalogi test/) też nie — opisy `it(...)` mogą mieć pauzę.
 * Celowa pauza w kodzie (np. instrukcja dla modelu AI „zamiast „—” pisz „–””) — jako escape `\u2014`:
 * strażnik patrzy na surowy tekst źródła, więc escape przechodzi.
 *
 * Dokumenty prawne i informacje dla konsumenta są w całości treścią dla klienta.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const PAUZA = '\u2014';

const KATALOGI = [
  'apps/www/src',
  'apps/client-panel/src',
  'apps/admin-panel/src',
  'apps/staff-panel/src',
  'apps/status-page/src',
  'apps/api/src',
  'libs/contracts/src',
  'libs/ui/src',
];
/**
 * Pomijane: pliki generowane, migracje Payload już wdrożone na produkcji (zmiana pliku nie zmieni danych)
 * i skrypty powłoki dla węzłów renderowane z API — to nie tekst dla klienta, a testy pilnują, że są
 * identyczne bajt w bajt z ops/scripts (agent-wezla-jedno-zrodlo, quota-xfs, tls-panelu).
 */
const POMIJANE = [
  /(^|\/)payload-types\.ts$/,
  /^apps\/www\/src\/migrations\//,
  /^apps\/api\/src\/servers\/[\w-]+\.script\.ts$/,
  /^apps\/api\/src\/servers\/node-tasks-agent\.install\.ts$/,
];

function pliki(katalog: string): string[] {
  return readdirSync(katalog).flatMap((n) => {
    const p = join(katalog, n);
    if (statSync(p).isDirectory()) {
      return ['node_modules', 'test', '__fixtures__', '__mocks__', '.next', 'dist'].includes(n) ? [] : pliki(p);
    }
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(n) && !/\.d\.ts$/.test(n) && !/\.(spec|test)\./.test(n) ? [p] : [];
  });
}

/** Pozycje pauzy w literałach tekstowych pliku (surowy tekst, bez komentarzy). */
function pauzyWLiteralach(nazwa: string, zrodlo: string): number[] {
  if (!zrodlo.includes(PAUZA)) return [];
  const rozsz = extname(nazwa);
  const rodzaj = rozsz === '.tsx' ? ts.ScriptKind.TSX : rozsz === '.ts' ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
  const sf = ts.createSourceFile(nazwa, zrodlo, ts.ScriptTarget.Latest, false, rodzaj);
  const pozycje: number[] = [];
  const LITERALY = new Set([
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral,
    ts.SyntaxKind.TemplateHead,
    ts.SyntaxKind.TemplateMiddle,
    ts.SyntaxKind.TemplateTail,
    ts.SyntaxKind.JsxText,
  ]);
  const odwiedz = (w: ts.Node): void => {
    // Szablon skryptu powłoki (od shebangu, np. bootstrap węzła w servers.service.ts) — nie tekst dla klienta.
    if (ts.isTemplateExpression(w) && w.head.text.startsWith('#!')) {
      for (const s of w.templateSpans) odwiedz(s.expression);
      return;
    }
    if (ts.isNoSubstitutionTemplateLiteral(w) && w.text.startsWith('#!')) return;
    if (LITERALY.has(w.kind)) {
      const start = w.getStart(sf);
      const fragment = zrodlo.slice(start, w.end);
      for (let i = fragment.indexOf(PAUZA); i >= 0; i = fragment.indexOf(PAUZA, i + 1)) pozycje.push(start + i);
    }
    ts.forEachChild(w, odwiedz);
  };
  odwiedz(sf);
  return pozycje;
}

function linia(zrodlo: string, poz: number): { nr: number; tekst: string } {
  const przed = zrodlo.slice(0, poz);
  const nr = przed.split('\n').length;
  const od = przed.lastIndexOf('\n') + 1;
  const doK = zrodlo.indexOf('\n', poz);
  return { nr, tekst: zrodlo.slice(od, doK < 0 ? undefined : doK).trim().slice(0, 140) };
}

describe('Bez pauzy „—” w tekstach dla ludzi (decyzja 6.11.2026: półpauza „–”)', () => {
  it('literały tekstowe w kodzie www, paneli, strony statusu, API, contracts i ui', () => {
    const trafienia = KATALOGI.flatMap((k) => pliki(join(KORZEN, k)))
      .filter((p) => !POMIJANE.some((re) => re.test(relative(KORZEN, p))))
      .flatMap((p) => {
        const zrodlo = readFileSync(p, 'utf8');
        return pauzyWLiteralach(p, zrodlo).map((poz) => {
          const l = linia(zrodlo, poz);
          return `${relative(KORZEN, p)}:${l.nr}  ${l.tekst}`;
        });
      });
    expect(trafienia).toEqual([]);
  });

  it('dokumenty prawne, informacja dla konsumenta i kalkulator na stronie statusu', () => {
    const DOKUMENTY = [
      ...['terms', 'privacy', 'cookies', 'dpa', 'subprocessors'].map((d) => `docs/legal/drafts/${d}.md`),
      'docs/legal/consumer-info.md',
    ];
    const trafienia = DOKUMENTY.flatMap((d) =>
      readFileSync(join(KORZEN, d), 'utf8')
        .split('\n')
        .flatMap((l, i) => (l.includes(PAUZA) ? [`${d}:${i + 1}`] : [])),
    );
    // Kalkulator (statyczny HTML): komentarze CSS/JS „/* … */” w jednej linii się nie liczą.
    const kalkulator = 'apps/status-page/public/kalkulator.html';
    readFileSync(join(KORZEN, kalkulator), 'utf8')
      .split('\n')
      .forEach((l, i) => {
        if (l.replace(/\/\*.*?\*\/|<!--.*?-->/g, '').includes(PAUZA)) trafienia.push(`${kalkulator}:${i + 1}`);
      });
    expect(trafienia).toEqual([]);
  });

  it('strażnik widzi pauzę w stringu, szablonie i JSX, a pomija komentarze, escape \\u2014 i skrypty od shebangu', () => {
    const p = PAUZA;
    const kod = [
      `// komentarz ${p} pomijany`,
      `/* blok ${p} pomijany */`,
      `const a = 'Tekst ${p} dla klienta';`,
      'const b = `Szablon ${x} ' + p + ' dalej`;',
      `const c = <p>Treść ${p} w JSX</p>;`,
      `const d = 'Instrukcja: zamiast \\u2014 pisz –';`,
      'const e = `#!/usr/bin/env bash\necho "skrypt ' + p + ' węzła ${y}"`;',
    ].join('\n');
    const pozycje = pauzyWLiteralach('x.tsx', kod);
    expect(pozycje.map((poz) => linia(kod, poz).nr)).toEqual([3, 4, 5]);
  });
});
