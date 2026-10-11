import { stanAktualnosciWp } from './stan-wordpressa';

const TERAZ = new Date('2026-10-11T21:00:00Z').getTime();

describe('stan aktualności WordPressa na liście stron (weryfikacja 11.10)', () => {
  it('świeże sprawdzenie bez aktualizacji i podatności → „aktualny”', () => {
    expect(stanAktualnosciWp({ sprawdzono: '2026-10-11T01:20:00Z' }, TERAZ)).toEqual({ tekst: 'aktualny', ton: 'data' });
  });

  it('podatności przy świeżym sprawdzeniu → bez „aktualny”', () => {
    expect(stanAktualnosciWp({ sprawdzono: '2026-10-11T01:20:00Z', podatnosci: 7 }, TERAZ)).toBeNull();
  });

  it('sprawdzenie sprzed 5 dni (d3: 6.10) → „dane sprzed 5 dni”, nie „aktualny”', () => {
    expect(stanAktualnosciWp({ sprawdzono: '2026-10-06T10:35:00Z', podatnosci: 7 }, TERAZ)).toEqual({ tekst: 'dane sprzed 5 dni — sprawdź ponownie', ton: 'muted' });
  });

  it('czekająca aktualizacja → osobne pigułki, bez stanu', () => {
    expect(stanAktualnosciWp({ sprawdzono: '2026-10-11T01:20:00Z', rdzen: '7.1.3' }, TERAZ)).toBeNull();
  });
});
