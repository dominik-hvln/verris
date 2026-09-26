import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

/**
 * Q-09 — panel klienta na telefonie: tabele nie przewijają się w bok i nie chowają kolumn.
 * Wzorzec: `v2-stack` (globals.css, @media max-width 767px) rozkłada wiersz na bloki, a
 * `data-label` na każdej komórce podpisuje wartość nazwą kolumny. Alternatywa:
 * components/panel/responsive-data-view.tsx (osobne karty na telefonie).
 * 2026-09-23: 5 tabel bez wzorca (zgody RODO, eksport danych, rekordy DNS migracji,
 * menedżer plików, deploy — ten ostatni chował kolumnę „Harmonogram” na telefonie).
 */
const SRC = resolve(import.meta.dirname, '../../../client-panel/src');
const WYJATKI = new Set(['components/panel/responsive-data-view.tsx']);

function pliki(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : pliki(p);
    return /\.tsx$/.test(n) && !/\.spec\./.test(n) ? [p] : [];
  });
}

const tabele = pliki(SRC).flatMap((p) => {
  const t = readFileSync(p, 'utf8');
  const rel = relative(SRC, p);
  return [...t.matchAll(/<table className=\{?[`"']([^`"']*)[`"']\}?>([\s\S]*?)<\/table>/g)].map((m) => ({
    rel, klasy: m[1], tresc: m[2], linia: t.slice(0, m.index).split('\n').length,
  }));
});

/** Atrybuty otwarcia `<td …>` — do pierwszego `>` poza {…}; className bywa typu `[&>svg]:…`. */
function otwarciaTd(jsx: string): string[] {
  const out: string[] = [];
  for (let i = jsx.indexOf('<td'); i !== -1; i = jsx.indexOf('<td', i + 3)) {
    if (/\w/.test(jsx[i + 3] ?? '')) continue;
    let glebokosc = 0;
    let j = i + 3;
    for (; j < jsx.length; j++) {
      const c = jsx[j];
      if (c === '{') glebokosc++;
      else if (c === '}') glebokosc--;
      else if (c === '>' && glebokosc === 0) break;
    }
    out.push(jsx.slice(i + 3, j));
  }
  return out;
}

describe('Q-09 — tabele w panelu klienta na telefonie', () => {
  it('test widzi tabele (sam się nie oszukuje)', () => {
    expect(tabele.length).toBeGreaterThan(10);
  });

  it('każda tabela ma v2-stack (albo idzie przez ResponsiveDataView)', () => {
    const bez = tabele.filter((t) => !WYJATKI.has(t.rel) && !/\bv2-stack\b/.test(t.klasy));
    expect(bez.map((t) => `${t.rel}:${t.linia}`)).toEqual([]);
  });

  it('w tabelach v2-stack każda komórka danych ma data-label (poza wierszami colSpan)', () => {
    const bez = tabele
      .filter((t) => /\bv2-stack\b/.test(t.klasy))
      .flatMap((t) => otwarciaTd(t.tresc)
        .filter((a) => !/data-label=/.test(a) && !/colSpan=/.test(a))
        .map(() => `${t.rel}:${t.linia}`));
    expect([...new Set(bez)]).toEqual([]);
  });

  it('żadna kolumna nie znika na wąskim ekranie (hidden …:table-cell)', () => {
    const chowane = pliki(SRC).filter((p) => /\bhidden\s+(sm|md|lg|xl):table-cell\b/.test(readFileSync(p, 'utf8')));
    expect(chowane.map((p) => relative(SRC, p))).toEqual([]);
  });
});
