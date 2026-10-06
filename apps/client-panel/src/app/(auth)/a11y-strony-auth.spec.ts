/**
 * P-12 — dostępność stron bez logowania (WCAG 2.4.1 Bypass Blocks, 2.4.2 Page Titled).
 *
 * Skip link z głównego layoutu prowadzi do `#main`. Na stronach `(auth)` nie było takiego celu
 * (skip link „w próżnię”, brak landmarku <main>), a wszystkie miały ten sam tytuł „Panel klienta”.
 * Strony są komponentami klienta, więc tytuł może iść tylko przez `layout.tsx` danej trasy.
 * Pełny przegląd renderowanych stron: `node ops/qa/a11y-axe.mjs` (axe-core, wymaga `next dev`).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const AUTH = __dirname;
const trasy = readdirSync(AUTH).filter((n) => statSync(join(AUTH, n)).isDirectory());

describe('strony (auth) — nawigacja i tytuły', () => {
  it('layout grupy owija treść w <main id="main"> (cel skip linka)', () => {
    const f = join(AUTH, 'layout.tsx');
    expect(existsSync(f)).toBe(true);
    expect(readFileSync(f, 'utf8')).toMatch(/<main id="main"/);
  });

  it.each(trasy)('%s ma własny tytuł w layout.tsx', (t) => {
    const f = join(AUTH, t, 'layout.tsx');
    expect(existsSync(f)).toBe(true);
    expect(readFileSync(f, 'utf8')).toMatch(/title:\s*"[^"]+ — Verris"/);
  });

  it('tytuły stron są unikalne', () => {
    const tytuly = trasy.map((t) => /title:\s*"([^"]+)"/.exec(readFileSync(join(AUTH, t, 'layout.tsx'), 'utf8'))?.[1]);
    const unikalne = new Set(tytuly);
    expect(unikalne.size).toBe(trasy.length);
  });
});
