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

  it('pole wyszukiwania domeny ma widoczny fokus (input ma outline:none, więc obramowanie opakowania)', () => {
    expect(CSS).toMatch(/\.dsearch:focus-within\{[^}]*border-color/);
  });

  it('ogłoszenie i baner cookies są w landmarkach (region)', () => {
    expect(readFileSync(join(DIR, 'layout.tsx'), 'utf8')).toMatch(/className="announce" role="region"/);
    expect(readFileSync(join(DIR, 'components/CookieConsent.tsx'), 'utf8')).toMatch(/className="cc-bar" role="region"/);
  });
});
