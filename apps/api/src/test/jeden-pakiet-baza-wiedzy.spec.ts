import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Decyzja właściciela 09.10: Verris ma JEDEN pakiet + autoskalowanie — nie ma wyższego planu.
 * Baza wiedzy (CMS pomocy i podpowiedzi AI) nie może więc radzić „przejdź na wyższy plan”
 * ani obiecywać, że panel podpowie rekomendację zmiany planu (takiej funkcji nie ma).
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const SEEDY = ['apps/api/src/cli/seed-kb-cms.ts', 'apps/api/src/cli/seed-knowledge-base.ts'];
const OBIETNICE = [/rekomendacj/i, /\bupgrade\b/i, /\bdowngrade\b/i, /bywa wyższy plan/i, /rozważ wyższy plan/i, /wybierz nowy plan/i];

describe('Baza wiedzy — jeden pakiet, bez obietnic wyższego planu', () => {
  it.each(SEEDY)('%s nie obiecuje wyższego planu ani rekomendacji zmiany planu', (plik) => {
    const linie = readFileSync(join(KORZEN, plik), 'utf8').split('\n');
    const trafienia = linie.flatMap((l, i) =>
      /^\s*(\/\/|\*|\/\*)/.test(l) ? [] : OBIETNICE.filter((r) => r.test(l)).map((r) => `${plik}:${i + 1} ${r}`),
    );
    expect(trafienia).toEqual([]);
  });

  it('artykuły o autoskalowaniu i zmianie planu mówią wprost o jednym pakiecie', () => {
    const cms = readFileSync(join(KORZEN, SEEDY[0]), 'utf8');
    const art = cms.slice(cms.indexOf("'autoskalowanie-bezpiecznik-kosztow'"), cms.indexOf('// ---------------- Migracja'));
    expect(art).toContain('jeden pakiet');
    const ai = readFileSync(join(KORZEN, SEEDY[1]), 'utf8');
    expect(ai).toMatch(/title: 'Zmiana planu[^']*',\s*audience: AiKnowledgeAudience\.ALL,\s*content: `Verris ma jeden pakiet/);
  });
});
