/**
 * P-12 — strażnik dostępności verris.pl (WCAG 1.4.1, 1.3.1, 2.4.7), tam gdzie da się to sprawdzić
 * bez przeglądarki. Pełny przegląd renderowanych stron: `node ops/qa/a11y-axe.mjs` (axe-core, `next dev`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = __dirname;
const CSS = readFileSync(join(DIR, 'globals.css'), 'utf8');

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return tsx(p);
    return /\.tsx$/.test(n) ? [p] : [];
  });
}

describe('verris.pl — dostępność', () => {
  it('link w ciągłym tekście jest podkreślony (mięta vs treść ma kontrast 1,1:1 — kolor to za mało)', () => {
    expect(CSS).toMatch(/p a:not\(\.btn\)[^{]*\{[^}]*text-decoration:\s*underline/);
  });

  it('nagłówki nie przeskakują poziomów: brak <h4> (po h1 → h2 → h3 w stopce axe zgłaszał heading-order)', () => {
    const z_h4 = tsx(DIR).filter((f) => /<h4[\s>]/.test(readFileSync(f, 'utf8')));
    expect(z_h4).toEqual([]);
  });

  it('suwaki kalkulatora piku mają widoczny fokus (globalnie input[type=range] ma outline:none)', () => {
    expect(CSS).toMatch(/\.kalk input\[type=range\]:focus-visible\{[^}]*outline:2px/);
  });

  it('menu mobilne: przycisk z aria-expanded i aria-controls, Esc zamyka', () => {
    const h = readFileSync(join(DIR, 'components/Header.tsx'), 'utf8');
    expect(h).toMatch(/aria-expanded=\{open\}/);
    expect(h).toMatch(/aria-controls="menu-mobilne"/);
    expect(h).toMatch(/id="menu-mobilne"/);
    expect(h).toMatch(/e\.key !== 'Escape'/);
  });

  it('animacja wykresu w hero tylko przy prefers-reduced-motion: no-preference', () => {
    const z_animacja = CSS.match(/[^}]*animation:grow[^}]*\}/g) || [];
    expect(z_animacja.length).toBeGreaterThan(0);
    for (const r of z_animacja) expect(CSS.slice(0, CSS.indexOf(r) + r.length)).toMatch(/@media\(prefers-reduced-motion:no-preference\)\{[^@]*$/);
  });

  it('ogłoszenie i baner cookies są w landmarkach (region)', () => {
    expect(readFileSync(join(DIR, 'layout.tsx'), 'utf8')).toMatch(/className="announce" role="region"/);
    expect(readFileSync(join(DIR, 'components/CookieConsent.tsx'), 'utf8')).toMatch(/className="cc-bar" role="region"/);
  });
});
