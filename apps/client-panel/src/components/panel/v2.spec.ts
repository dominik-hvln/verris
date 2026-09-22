import { backupDays, barHeights, bucketize, fmtMb, lastDaysLabels, niceStep, parseBackupDate, placeTip, tip } from './v2';

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

describe('niceStep', () => {
  it('daje krok 1/2/5 × 10^n', () => {
    expect(niceStep(150)).toBe(50);
    expect(niceStep(12)).toBe(5);
    expect(niceStep(3.6)).toBe(1);
    expect(niceStep(8000)).toBe(2000);
  });
});

describe('placeTip', () => {
  const view = { w: 1000, h: 800 };
  it('nad elementem, wyśrodkowany', () => {
    expect(placeTip({ x: 500, y: 300, bottom: 320 }, { w: 100, h: 40 }, view)).toEqual({ left: 450, top: 252 });
  });
  it('przy górnej krawędzi (np. portfel w pasku) — pod elementem', () => {
    expect(placeTip({ x: 500, y: 10, bottom: 40 }, { w: 100, h: 40 }, view).top).toBe(48);
  });
  it('przy prawej krawędzi nie wychodzi poza ekran', () => {
    expect(placeTip({ x: 990, y: 300, bottom: 320 }, { w: 300, h: 40 }, view).left).toBe(692);
  });
  it('przy lewej krawędzi nie wychodzi poza ekran', () => {
    expect(placeTip({ x: 5, y: 300, bottom: 320 }, { w: 300, h: 40 }, view).left).toBe(8);
  });
});

describe('backupDays', () => {
  const today = new Date('2026-09-22T10:00:00Z');
  it('zaznacza dni, w których jest kopia', () => {
    const days = backupDays(['backup-2026-09-22-user.tar.zst', 'backup-Sep-20-2026.tar.gz'], 4, today);
    expect(days).toEqual([false, true, false, true]);
  });
  it('bez kopii — same puste dni', () => {
    expect(backupDays([], 3, today)).toEqual([false, false, false]);
  });
  it('czyta datę z nazwy pliku', () => {
    expect(parseBackupDate('user.admin.2026-01-05.tar.gz')).toBe(Date.UTC(2026, 0, 5));
    expect(parseBackupDate('brak-daty.tar.gz')).toBeNull();
  });
});
