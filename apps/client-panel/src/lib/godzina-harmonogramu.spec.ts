import { godzinaPolska, opcjeGodzinyHarmonogramu } from './godzina-harmonogramu';

describe('godzina harmonogramu kopii — czas polski zamiast UTC (weryfikacja 11.10)', () => {
  it('03:00 UTC to 05:00 w Polsce latem (październik przed zmianą czasu) i 04:00 zimą', () => {
    expect(godzinaPolska(3, new Date('2026-10-11T12:00:00Z'))).toBe(5);
    expect(godzinaPolska(3, new Date('2026-12-01T12:00:00Z'))).toBe(4);
  });

  it('lista: 24 pozycje, wartość UTC, etykieta po polsku, od 00:00 czasu polskiego', () => {
    const o = opcjeGodzinyHarmonogramu(new Date('2026-10-11T12:00:00Z'));
    expect(o).toHaveLength(24);
    expect(o[0]).toEqual({ value: '22', label: '00:00' });
    expect(o.find((x) => x.value === '3')!.label).toBe('05:00');
  });
});
