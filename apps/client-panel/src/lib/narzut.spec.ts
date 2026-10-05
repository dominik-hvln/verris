import { cenaZNarzutem, planyZNarzutem } from './narzut';

describe('O-07 — cena z narzutem resellera (jak w API)', () => {
  it('bez narzutu zwraca cenę z cennika', () => {
    expect(cenaZNarzutem('45.00', 0)).toBe('45.00');
  });

  it('dolicza narzut i zaokrągla do grosza w górę od połowy (HALF_UP)', () => {
    expect(cenaZNarzutem('45.00', 20)).toBe('54.00');
    expect(cenaZNarzutem('399.00', 20)).toBe('478.80');
    // 0,05 × 1,5 = 0,075 → 0,08 (HALF_UP); float dałby 0,07
    expect(cenaZNarzutem('0.05', 50)).toBe('0.08');
    // 19,99 × 1,15 = 22,9885 → 22,99
    expect(cenaZNarzutem('19.99', 15)).toBe('22.99');
  });

  it('przelicza obie ceny planów', () => {
    expect(planyZNarzutem([{ id: 'a', priceMonthly: '45.00', priceYearly: '399.00' }], 20)).toEqual([
      { id: 'a', priceMonthly: '54.00', priceYearly: '478.80' },
    ]);
  });
});
