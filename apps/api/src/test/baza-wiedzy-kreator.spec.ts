import { readFileSync } from 'fs';
import { join } from 'path';
import { CENA_KREATORA_PRO, PLANY_KREATORA } from '@verris/kreator';
import { PLAN_KREATOR_PRO } from '../plans/plan-kreator-pro.js';

/**
 * Paczka 123 — pomoc (pomoc.verris.pl i baza wiedzy w panelu) ma 4 artykuły o Verris Kreatorze w seedzie CMS
 * (seed-kb-cms.ts, uruchamiany ręcznie). Liczby i ceny w artykułach są tekstem w bazie, więc test pilnuje,
 * że zgadzają się z kodem produktu: limity z PLANY_KREATORA, ceny z PLAN_KREATOR_PRO (brutto) i CENA_KREATORA_PRO
 * (netto jak na fakturze). Artykuły nie obiecują tego, czego publikacja jeszcze nie ma (WordPress, wersje językowe).
 * Na starym kodzie czerwony: kategorii ani artykułów kreatora w seedzie nie było.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const SEED = readFileSync(join(KORZEN, 'apps/api/src/cli/seed-kb-cms.ts'), 'utf8');
const SLUGI = ['jak-stworzyc-strone-w-kreatorze', 'edycja-tekstu-i-zdjec-w-kreatorze', 'publikacja-strony-z-kreatora', 'kreator-pro'];

/** Treść artykułów kategorii kreatora (od pierwszego do końca listy ARTICLES). */
const ARTYKULY = SEED.slice(SEED.indexOf("A('kreator-stron'"), SEED.indexOf('\n];\n\nfunction toPlain'));
const zl = (kwota: string | number) => {
  const [c, g] = Number(kwota).toFixed(2).split('.');
  return g === '00' ? `${c} zł` : `${c},${g} zł`;
};

describe('Baza wiedzy – Verris Kreator', () => {
  it('kategoria „Kreator stron” i cztery artykuły w niej', () => {
    expect(SEED).toMatch(/\{ slug: 'kreator-stron', name: 'Kreator stron',/);
    for (const slug of SLUGI) expect(ARTYKULY).toContain(`A('kreator-stron', '${slug}',`);
    expect(ARTYKULY.match(/A\('kreator-stron', /g)).toHaveLength(SLUGI.length);
  });

  it('powiązane artykuły wskazują istniejące slugi', () => {
    const wszystkie = new Set([...SEED.matchAll(/A\('[\w-]+', '([\w-]+)',/g)].map((m) => m[1]));
    const powiazane = [...ARTYKULY.matchAll(/related: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]));
    expect(powiazane.length).toBeGreaterThan(0);
    expect(powiazane.filter((s) => !wszystkie.has(s))).toEqual([]);
  });

  it('ceny Kreatora Pro w artykule = plan kreator-pro (brutto) i netto z faktury', () => {
    expect(ARTYKULY).toContain(`${zl(PLAN_KREATOR_PRO.priceMonthly)} brutto (${zl(CENA_KREATORA_PRO.miesiacNetto)} netto)`);
    expect(ARTYKULY).toContain(`${zl(PLAN_KREATOR_PRO.priceYearly)} brutto (${zl(CENA_KREATORA_PRO.rokNetto)} netto)`);
  });

  it('limity w artykułach = PLANY_KREATORA (hosting, Pro, okres próbny)', () => {
    const h = PLANY_KREATORA.hosting;
    const p = PLANY_KREATORA.pro;
    const t = PLANY_KREATORA.proba;
    expect(ARTYKULY).toContain(
      `${h.stron} strony na koncie, do ${h.podstron} podstron w każdej, ${h.generacjiMies} generacje i ${h.zmianAiMies} zmian AI miesięcznie`,
    );
    expect(p.podstron).toBeNull();
    expect(ARTYKULY).toContain(`${p.stron} stron, podstrony bez limitu, ${p.generacjiMies} generacji i ${p.zmianAiMies} zmian AI miesięcznie`);
    expect(ARTYKULY).toContain(`daje ${p.wariantyGeneracji} propozycje projektu`);
    expect(ARTYKULY).toContain(`${t.stron} strona, ${t.generacjiMies} generacja i ${t.zmianAiMies} zmian AI`);
  });

  it('bez obietnic spoza publikacji: przejście na WordPressa i wersje językowe', () => {
    expect(ARTYKULY).not.toMatch(/WordPress|wersj\p{L}* językow|wielojęzycz|hreflang|tłumacze/iu);
  });
});
