import { dailyUptime, downIntervals, embeddedOnDomain, sealReason, windowPct } from './badge-logic.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 23, 12, 0, 0);

describe('badge — dostępność per dzień', () => {
  it('awaria 1 h wczoraj = ~95,83% wczoraj, 100% dziś; dni przed monitorem = brak danych', () => {
    const yesterdayNoon = Date.UTC(2026, 8, 22, 12, 0, 0);
    const iv = downIntervals([{ createdAt: new Date(yesterdayNoon + 3600_000), durationS: 3600 }], null, now);
    const days = dailyUptime(iv, now - 2 * DAY, now, 5);
    expect(days).toHaveLength(5);
    expect(days[0].pct).toBeNull();
    expect(days[3].pct).toBeCloseTo((1 - 1 / 24) * 100, 5);
    expect(days[3].downS).toBe(3600);
    expect(days[4].pct).toBe(100);
  });

  it('trwająca awaria liczy się do teraz; okno nie sięga przed start monitora', () => {
    const iv = downIntervals([], new Date(now - 6 * 3600_000), now);
    expect(windowPct(iv, now - DAY, now, 30)).toBeCloseTo(75, 5);
    expect(windowPct([], now, now, 30)).toBeNull();
  });

  it('nakładające się przerwy nie dają ujemnej dostępności', () => {
    const iv = [{ from: now - 2 * DAY, to: now }, { from: now - 2 * DAY, to: now }];
    expect(windowPct(iv, now - DAY, now, 1)).toBe(0);
  });
});

describe('badge — pieczęć', () => {
  const ok = {
    active: true,
    monitor: { enabled: true, lastStatus: 'UP', lastCheckedAt: new Date(now - 60_000), tlsExpiresAt: new Date(now + 30 * DAY) },
    uptime30: 99.9,
    now,
  };
  it('wszystko spełnione → OK', () => expect(sealReason(ok)).toBe('OK'));
  it.each([
    [{ ...ok, active: false }, 'USLUGA_NIEAKTYWNA'],
    [{ ...ok, monitor: null }, 'BRAK_MONITORA'],
    [{ ...ok, monitor: { ...ok.monitor, lastStatus: 'DOWN' } }, 'STRONA_NIE_DZIALA'],
    [{ ...ok, monitor: { ...ok.monitor, lastCheckedAt: new Date(now - 2 * DAY) } }, 'MONITOR_NIEAKTUALNY'],
    [{ ...ok, monitor: { ...ok.monitor, tlsExpiresAt: new Date(now - 1) } }, 'BRAK_SSL'],
    [{ ...ok, uptime30: 99.4 }, 'NISKA_DOSTEPNOSC'],
    [{ ...ok, uptime30: null }, 'NISKA_DOSTEPNOSC'],
  ])('%#', (input, reason) => expect(sealReason(input as typeof ok)).toBe(reason));

  it('domena osadzenia: www i wielkość liter bez znaczenia, obca i brak Referer = nie', () => {
    expect(embeddedOnDomain('https://www.Piekarnia.pl/kontakt', 'piekarnia.pl')).toBe(true);
    expect(embeddedOnDomain('https://piekarnia.pl.evil.com/', 'piekarnia.pl')).toBe(false);
    expect(embeddedOnDomain('https://evil.com/', 'piekarnia.pl')).toBe(false);
    expect(embeddedOnDomain(undefined, 'piekarnia.pl')).toBe(false);
    expect(embeddedOnDomain('https://panel.verris.pl/dashboard', 'piekarnia.pl', ['https://panel.verris.pl'])).toBe(true);
  });
});
