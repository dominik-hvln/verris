import { describe, expect, it } from 'vitest';
import { koloryKierunku } from './wspolne-marki.ts';
import { koloryMarki, kontrastyMarki, MIN_KONTRAST_NAPISU, MIN_KONTRAST_ZNAKU } from '../kolory-marki.ts';

/**
 * Paczka 131 – jedno źródło kolorów marki: kierunki od AI (i zamienniki, propozycja palety z analizy logo) rozwijają
 * barwę przez `koloryMarki` z kolory-marki.ts, a nie przez osobny przepis. Na starym kodzie (generujPalete +
 * własne progi w wspolne-marki.ts) wynik różnił się od koloryMarki – test był czerwony.
 */
describe('koloryKierunku = koloryMarki', () => {
  it('barwa akcentu z AI, główny z tej samej barwy', () => {
    expect(koloryKierunku(205, 'jasna')).toEqual(koloryMarki(205, 'jasna', { akcentBarwa: 205 }));
  });

  it('osobna barwa główna (b2) i normalizacja kąta', () => {
    expect(koloryKierunku(-20, 'ziemista', 400)).toEqual(koloryMarki(40, 'ziemista', { akcentBarwa: 340 }));
  });

  it('kontrasty jak w regułach marki', () => {
    const k = kontrastyMarki(koloryKierunku(60, 'pastelowa'));
    expect(k.glownyNaBieli).toBeGreaterThanOrEqual(MIN_KONTRAST_NAPISU);
    expect(k.akcentNaBieli).toBeGreaterThanOrEqual(MIN_KONTRAST_ZNAKU);
  });
});
