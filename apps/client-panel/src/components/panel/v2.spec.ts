import { backupDays, barHeights, bucketize, fmtMb, procentGb, lastDaysLabels, niceStep, parseBackupDate, placeTip, tip } from './v2';

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
  it('bucketize: szczyt w każdej pełnej godzinie, ostatni słupek od pełnej godziny', () => {
    const now = new Date('2026-10-09T12:10:00Z');
    // Próbki co minutę od 11:15 do 12:09 UTC; szczyt 198 o 11:40 (jak benchmark na d3 09.10).
    const rows = Array.from({ length: 55 }, (_, i) => ({
      bucketStart: new Date(Date.UTC(2026, 9, 9, 11, 15 + i)).toISOString(),
      value: i === 25 ? 198 : 5,
    }));
    const b = bucketize(rows, 24, now);
    expect(b.values).toEqual([198, 5]); // 11:00–12:00 i 12:00–teraz
    const godz = (iso: string) => new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    expect(b.labels).toEqual([godz('2026-10-09T11:00:00Z'), godz('2026-10-09T12:00:00Z')]);
    expect(bucketize([], 8)).toEqual({ values: [], labels: [] });
  });
  it('bucketize: luka w telemetrii daje 0, nie rozciąga sąsiednich słupków', () => {
    const now = new Date('2026-10-09T12:10:00Z');
    const rows = [
      { bucketStart: '2026-10-09T09:30:00Z', value: 40 },
      { bucketStart: '2026-10-09T12:05:00Z', value: 10 },
    ];
    expect(bucketize(rows, 24, now).values).toEqual([40, 0, 0, 10]);
  });
  it('procentGb (karta „Dysk i transfer”): procent i GB po polsku, bez limitu, brak danych', () => {
    expect(procentGb(5427, 7680)).toBe('71% (5,3 GB / 7,5 GB)');
    expect(procentGb(300, 20480)).toBe('1% (0,3 GB / 20 GB)');
    expect(procentGb(5000, null)).toBe('4,9 GB · bez limitu');
    expect(procentGb(null, 7680)).toBe('—');
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
