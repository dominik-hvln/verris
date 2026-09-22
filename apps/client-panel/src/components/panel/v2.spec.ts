import { barHeights, bucketize, fmtMb, lastDaysLabels, tip } from './v2';

describe('PB-15 klocki v2', () => {
  it('barHeights skaluje do maksimum i nie gubi zer', () => {
    expect(barHeights([0, 50, 100])).toEqual([8, 50, 100]);
    expect(barHeights([0, 0])).toEqual([8, 8]);
    expect(barHeights([-5, 10])).toEqual([8, 100]);
  });
  it('tip łączy tytuł i szczegół nową linią', () => {
    expect(tip('3,2 GB', 'poczta')).toBe('3,2 GB\npoczta');
    expect(tip('sam')).toBe('sam');
  });
  it('lastDaysLabels zwraca n dni kończąc na dziś', () => {
    const l = lastDaysLabels(7, new Date(2026, 8, 22));
    expect(l).toHaveLength(7);
    expect(l[6]).toContain('22');
    expect(l[0]).toContain('16');
  });
  it('bucketize bierze maksimum z kubełka', () => {
    const rows = [1, 5, 2, 9, 3, 4].map((value, i) => ({ bucketStart: `2026-09-22T0${i}:00:00Z`, value }));
    const b = bucketize(rows, 3);
    expect(b.values).toEqual([5, 9, 4]);
    expect(b.labels).toHaveLength(3);
    expect(bucketize([], 8)).toEqual({ values: [], labels: [] });
  });
  it('fmtMb: MB poniżej 1 GB, GB z przecinkiem, brak = kreska', () => {
    expect(fmtMb(512)).toBe('512 MB');
    expect(fmtMb(12698)).toBe('12,4 GB');
    expect(fmtMb(null)).toBe('—');
  });
});
