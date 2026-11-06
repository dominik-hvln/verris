/**
 * Uwaga Dominika 6.11.2026: kalkulator autoskalowania (/cennik) nie może zaokrąglać stawek ani kosztu godziny do
 * dwóch miejsc — stawki mają ułamki grosza (np. 0,001283 zł za 1% CPU/h). Liczymy na pełnych stawkach z API,
 * do grosza zaokrąglamy tylko kwoty do zapłaty; stawki i godzina z mocą brutto i netto.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { CENY_ZAPASOWE, type Ceny } from '@/lib/ceny';
import { AKalkulator } from './AKalkulator';

const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');

// Stawki z sześcioma miejscami (tyle trzyma API: Decimal(12, 6)). Suwaki startowe: +400% CPU, +8 GB RAM, 36 h.
const CENY: Ceny = { ...CENY_ZAPASOWE, stawki: { cpu: 0.001283, ram: 0.012345, dysk: 0.0008 }, zrodlo: 'api' };

describe('AKalkulator — stawki i godzina bez zaokrąglania do 2 miejsc', () => {
  const t = tekst(renderToStaticMarkup(<AKalkulator wariant="pelny" ceny={CENY} />));

  it('stawki wszystkimi cyframi, brutto i netto', () => {
    expect(t).toContain('1% procesora (100% = 1 vCPU) — 0,001283 zł (0,00104309 zł)');
    // stary kod: „0,01235” (4 cyfry znaczące)
    expect(t).toContain('1 GB RAM — 0,012345 zł (0,0100366 zł)');
    expect(t).toContain('1 GB dysku — 0,0008 zł (0,000650407 zł)');
  });

  it('godzina z taką mocą poniżej 1 zł pokazana dokładnie (400 × 0,001283 + 8 × 0,012345 = 0,61196 zł)', () => {
    expect(t).toContain('Godzina z taką mocą 0,61196 zł brutto (0,497528 zł netto)');
    expect(t).not.toContain('Godzina z taką mocą 0,61 zł');
  });

  it('kwoty do zapłaty liczone z pełnych stawek i dopiero na końcu do grosza', () => {
    // 0,61196 × 36 = 22,03056 → 22,03 zł; netto 22,03056 / 1,23 = 17,9110… → 17,91 zł
    expect(t).toContain('22,03 zł brutto (17,91 zł netto)');
    // 0,61196 × 730 = 446,7308 → 446,73 zł; netto 363,1958… → 363,20 zł
    expect(t).toContain('446,73 zł brutto (363,20 zł netto)');
  });
});
