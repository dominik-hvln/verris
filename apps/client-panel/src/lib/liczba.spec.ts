import { kwotaGodzinowa, liczba } from './liczba';

describe('liczba', () => {
  it('przecinek dziesiętny i stała liczba miejsc', () => {
    expect(liczba(80.48, 2)).toBe('80,48');
    expect(liczba(0.0662, 4)).toBe('0,0662');
    expect(liczba(5, 1)).toBe('5,0');
  });
});

describe('kwotaGodzinowa', () => {
  it('poniżej 1 — wszystkie cyfry stawki, od 1 — do grosza', () => {
    expect(kwotaGodzinowa(0.001323)).toBe('0,001323');
    expect(kwotaGodzinowa(50 * 0.001323)).toBe('0,06615');
    expect(kwotaGodzinowa(0.5 * 0.0882)).toBe('0,0441');
    expect(kwotaGodzinowa(0.4)).toBe('0,40');
    expect(kwotaGodzinowa(0)).toBe('0,00');
    expect(kwotaGodzinowa(1.2348)).toBe('1,23');
  });
});
