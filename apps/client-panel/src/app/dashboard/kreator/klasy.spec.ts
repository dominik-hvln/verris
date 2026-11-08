import { klasaPola, klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego, klasaPrzyciskuIkony } from './klasy';

/**
 * Paczka 123 – pola i przyciski formularzy kreatora: cel dotykowy ≥ 44 px na telefonie (< 768 px, wariant max-md),
 * bez zmiany wymiarów od 768 px (gęstość edytora na komputerze).
 */
const klasy = (k: string) => k.split(/\s+/);

describe('klasy kreatora – cel dotykowy', () => {
  it('pole: 46 px na telefonie z paddingu i 16 px tekstu (24 px linii + 2 × 10 px + ramka), bez min-height', () => {
    expect(klasy(klasaPola)).toEqual(expect.arrayContaining(['max-md:py-2.5', 'max-md:text-base']));
    // Textarea ma własne min-h-[84px] – wariant max-md nie może go obniżyć.
    expect(klasy(klasaPola).some((c) => c.includes('min-h-'))).toBe(false);
  });

  it.each([
    ['przycisk główny', klasaPrzyciskuGlownego],
    ['przycisk drugi', klasaPrzyciskuDrugiego],
  ])('%s: min. 44 px wysokości na < 768 px', (_n, k) => {
    expect(klasy(k)).toContain('max-md:min-h-11');
  });

  it('przycisk-ikona: 44 × 44 px na telefonie, 28 px od 768 px', () => {
    expect(klasy(klasaPrzyciskuIkony)).toEqual(expect.arrayContaining(['h-7', 'w-7', 'max-md:h-11', 'max-md:w-11']));
  });

  it('od 768 px bez zmian: pole text-sm py-2, przyciski py-2', () => {
    expect(klasy(klasaPola)).toEqual(expect.arrayContaining(['text-sm', 'py-2']));
    for (const k of [klasaPola, klasaPrzyciskuGlownego, klasaPrzyciskuDrugiego, klasaPrzyciskuIkony]) {
      expect(klasy(k).filter((c) => /^(md|lg|xl):/.test(c))).toEqual([]);
    }
  });
});
