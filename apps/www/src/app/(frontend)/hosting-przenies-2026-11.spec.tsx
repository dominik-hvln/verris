/**
 * Makieta 1.11.2026 — nowe sekcje /hosting i /przenies-strone. Ceny w treści muszą pochodzić z modułu cen
 * (lib/ceny-api.ts zwraca w testach CENY_ZAPASOWE), więc test podmienia ceny i sprawdza, że strona je pokazuje.
 */
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CENY_ZAPASOWE, type Ceny } from '@/lib/ceny';

jest.mock('next/navigation', () => ({ usePathname: () => null, notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

const CENY_TESTOWE: Ceny = {
  ...CENY_ZAPASOWE,
  hosting: { miesiecznie: 51, rocznie: 501, trialDays: 0 },
  stawki: { cpu: 0.002, ram: 0.1, dysk: 0.001 },
  zrodlo: 'api',
};
let ceny: Ceny = CENY_TESTOWE;
jest.mock('@/lib/ceny-api', () => ({ pobierzCeny: async () => ceny }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const hosting = () => require('./hosting/page') as { default: () => Promise<ReactElement> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const przenies = () => require('./przenies-strone/page') as { default: () => Promise<ReactElement> };

const tekst = async (m: { default: () => Promise<ReactElement> }) =>
  renderToStaticMarkup(await m.default())
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

describe('/hosting — makieta 1.11', () => {
  beforeEach(() => {
    ceny = CENY_TESTOWE;
  });

  it('ceny i stawki z modułu cen (brutto i netto), bez dawnych stałych', async () => {
    const t = await tekst(hosting());
    expect(t).toContain('51 zł');
    expect(t).toContain('501 zł brutto (407,32 zł netto)');
    expect(t).toContain('0,002 zł za 1% CPU/h');
    expect(t).not.toMatch(/\b45 zł|\b449 zł/);
  });

  it('nowe sekcje: specyfikacja w zakładkach, płatne dodatki, sześć pytań, pas rozmowy', async () => {
    const t = await tekst(hosting());
    expect(t).toContain('Wszystko, co jest w pakiecie');
    expect(t).toContain('Płatne dodatki, wszystkie w jednym miejscu');
    expect(t).toContain('Więcej miejsca na dysku');
    expect(t).toContain('Sześć pytań do każdego dostawcy');
    expect(t).toContain('Wolisz porozmawiać?');
    expect(t).not.toContain('Cztery pytania');
  });

  it('bez próby: „Zamów hosting” i bez „Bez karty”; z próbą: „Wypróbuj 14 dni za darmo” i „Bez karty”', async () => {
    let t = await tekst(hosting());
    expect(t).toContain('Zamów hosting');
    expect(t).not.toContain('Bez karty');
    ceny = { ...CENY_TESTOWE, hosting: { ...CENY_TESTOWE.hosting, trialDays: 14 } };
    t = await tekst(hosting());
    expect(t).toContain('Wypróbuj 14 dni za darmo');
    expect(t).toContain('Bez karty');
  });
});

describe('/przenies-strone — makieta 1.11', () => {
  beforeEach(() => {
    ceny = CENY_TESTOWE;
  });

  it('pilny przypadek, czasy przeniesienia i „co się zmieni” z ceną z modułu', async () => {
    const t = await tekst(przenies());
    expect(t).toContain('Kończy Ci się hosting? Zacznij przeniesienie dziś');
    expect(t).toContain('Co zmieni się dla Twojej strony');
    expect(t).toContain('15–30 min');
    expect(t).toContain('501 zł brutto (407,32 zł netto) rocznie');
    expect(t).not.toMatch(/\b45 zł|\b449 zł/);
  });

  it('nie obiecuje odtworzenia strony z pliku kopii w panelu (migrator tego nie ma)', async () => {
    const t = await tekst(przenies());
    expect(t).toContain('Poproś starego dostawcę o kopię strony i napisz do nas');
    expect(t).not.toMatch(/z pliku kopii|wgraj (własną )?kopię/i);
  });
});
