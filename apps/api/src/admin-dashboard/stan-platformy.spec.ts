import { czasTrwania, sygnal } from './stan-platformy.js';

describe('PB-34 czas po ludzku na pulpicie', () => {
  it('minuty, godziny, dni — bez „107106 min”', () => {
    expect(czasTrwania(45)).toBe('45 min');
    expect(czasTrwania(119)).toBe('119 min');
    expect(czasTrwania(5 * 60)).toBe('5 h');
    expect(czasTrwania(107106)).toBe('74 dni');
  });

  it('sygnał węzła', () => {
    const teraz = Date.parse('2026-09-26T20:00:00Z');
    expect(sygnal(null, teraz)).toBe('brak');
    expect(sygnal(new Date(teraz - 60_000), teraz)).toBe('na żywo');
    expect(sygnal(new Date(teraz - 3 * 86_400_000), teraz)).toBe('3 dni temu');
  });
});
