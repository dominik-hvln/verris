import { doWyswietlenia, przesun, przesunMiesiac, rozbierz, siatkaMiesiaca, zloz } from './kalendarz';

describe('kalendarz pola daty', () => {
  it('siatka zaczyna się od poniedziałku i ma 6 tygodni', () => {
    const wrzesien = siatkaMiesiaca(2026, 8); // 1.09.2026 to wtorek
    expect(wrzesien).toHaveLength(42);
    expect(wrzesien[0]).toEqual({ rok: 2026, miesiac: 7, dzien: 31 });
    expect(wrzesien[1]).toEqual({ rok: 2026, miesiac: 8, dzien: 1 });
  });

  it('wartość w formacie natywnego pola — w obie strony', () => {
    expect(zloz({ rok: 2026, miesiac: 0, dzien: 5 })).toBe('2026-01-05');
    expect(zloz({ rok: 2026, miesiac: 0, dzien: 5 }, 9, 7)).toBe('2026-01-05T09:07');
    expect(rozbierz('2026-01-05T09:07')).toEqual({ dzien: { rok: 2026, miesiac: 0, dzien: 5 }, godzina: 9, minuta: 7 });
    expect(rozbierz('2026-02-30')).toBeNull();
    expect(rozbierz('')).toBeNull();
  });

  it('klawiatura przechodzi przez granice miesięcy i lat, miesiąc przycina dzień', () => {
    expect(przesun({ rok: 2026, miesiac: 11, dzien: 31 }, 1)).toEqual({ rok: 2027, miesiac: 0, dzien: 1 });
    expect(przesunMiesiac({ rok: 2026, miesiac: 0, dzien: 31 }, 1)).toEqual({ rok: 2026, miesiac: 1, dzien: 28 });
  });

  it('wyświetla po polsku', () => {
    expect(doWyswietlenia('2026-09-24', false)).toBe('24.09.2026');
    expect(doWyswietlenia('2026-09-24T14:30', true)).toBe('24.09.2026, 14:30');
  });
});
