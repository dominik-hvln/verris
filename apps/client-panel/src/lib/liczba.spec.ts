import { liczba } from './liczba';

describe('liczba', () => {
  it('przecinek dziesiętny i stała liczba miejsc', () => {
    expect(liczba(80.48, 2)).toBe('80,48');
    expect(liczba(0.0662, 4)).toBe('0,0662');
    expect(liczba(5, 1)).toBe('5,0');
  });
});
