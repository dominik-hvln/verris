import {
  clipIntervals,
  intersectIntervals,
  mergeIntervals,
  previousMonthUtc,
  tierPercent,
  totalMinutes,
  type Interval,
} from './sla-credit.scheduler';

const iv = (startIso: string, endIso: string): Interval => ({
  start: new Date(startIso),
  end: new Date(endIso),
});

describe('tierPercent — tabela progów §15 ust. 2', () => {
  it('nie przyznaje rekompensaty przy dostępności ≥ 99,5%', () => {
    expect(tierPercent(10000)).toBe(0); // 100%
    expect(tierPercent(9950)).toBe(0); // dokładnie 99,50% — SLA dotrzymane
    expect(tierPercent(9986)).toBe(0); // 60 min przestoju w 30-dniowym miesiącu
  });

  it('stosuje progi zgodnie z granicami domkniętymi od dołu', () => {
    expect(tierPercent(9949)).toBe(5); // tuż poniżej 99,5%
    expect(tierPercent(9900)).toBe(5); // dokładnie 99,0%
    expect(tierPercent(9899)).toBe(25);
    expect(tierPercent(9500)).toBe(25); // dokładnie 95,0%
    expect(tierPercent(9499)).toBe(50);
    expect(tierPercent(9000)).toBe(50); // dokładnie 90,0%
    expect(tierPercent(8999)).toBe(100);
    expect(tierPercent(0)).toBe(100);
  });

  /**
   * Regresja wobec starego wzoru `opłata × minuty × 10 ÷ 43200`, który przy 216 min
   * przestoju (czyli dokładnie 99,5% — SLA DOTRZYMANE) wypłacał ~4,88% opłaty.
   */
  it('nie płaci przy przestoju 216 min w 30-dniowym miesiącu (99,5%)', () => {
    const exposureMin = 30 * 24 * 60; // 43200
    const availabilityBp = Math.round(((exposureMin - 216) / exposureMin) * 10000);
    expect(availabilityBp).toBe(9950);
    expect(tierPercent(availabilityBp)).toBe(0);
  });

  /** Stary wzór dawał przy 90% dostępności ~100%; umowa mówi 50%. */
  it('przy dokładnie 90% dostępności daje 50%, nie 100%', () => {
    const exposureMin = 30 * 24 * 60;
    const availabilityBp = Math.round(((exposureMin - 4320) / exposureMin) * 10000);
    expect(availabilityBp).toBe(9000);
    expect(tierPercent(availabilityBp)).toBe(50);
  });
});

describe('mergeIntervals', () => {
  it('scala nakładające się przedziały (równoległe sondy tego samego serwera)', () => {
    const merged = mergeIntervals([
      iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z'),
      iv('2026-06-01T10:30:00Z', '2026-06-01T12:00:00Z'),
    ]);
    expect(merged).toHaveLength(1);
    expect(totalMinutes(merged)).toBe(120);
  });

  it('nie scala rozłącznych przedziałów', () => {
    const merged = mergeIntervals([
      iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z'),
      iv('2026-06-02T10:00:00Z', '2026-06-02T11:00:00Z'),
    ]);
    expect(merged).toHaveLength(2);
    expect(totalMinutes(merged)).toBe(120);
  });

  it('scala przedziały stykające się końcami', () => {
    const merged = mergeIntervals([
      iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z'),
      iv('2026-06-01T11:00:00Z', '2026-06-01T11:30:00Z'),
    ]);
    expect(merged).toHaveLength(1);
    expect(totalMinutes(merged)).toBe(90);
  });

  it('radzi sobie z wejściem nieposortowanym i zagnieżdżonym', () => {
    const merged = mergeIntervals([
      iv('2026-06-01T12:00:00Z', '2026-06-01T13:00:00Z'),
      iv('2026-06-01T10:00:00Z', '2026-06-01T14:00:00Z'), // zawiera poprzedni
    ]);
    expect(merged).toHaveLength(1);
    expect(totalMinutes(merged)).toBe(240);
  });
});

describe('clipIntervals', () => {
  it('przycina do okna i odrzuca przedziały poza nim', () => {
    const clipped = clipIntervals(
      [
        iv('2026-05-31T23:00:00Z', '2026-06-01T01:00:00Z'), // wchodzi z poprzedniego miesiąca
        iv('2026-06-15T10:00:00Z', '2026-06-15T11:00:00Z'),
        iv('2026-07-01T00:00:00Z', '2026-07-01T05:00:00Z'), // całkowicie poza
      ],
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-07-01T00:00:00Z'),
    );
    expect(clipped).toHaveLength(2);
    expect(totalMinutes(clipped)).toBe(60 + 60);
  });
});

describe('intersectIntervals — wyłączenia z §15 ust. 5', () => {
  it('zwraca wyłącznie część przestoju pokrytą oknem konserwacyjnym', () => {
    const outages = [iv('2026-06-01T10:00:00Z', '2026-06-01T14:00:00Z')]; // 240 min
    const maintenance = [iv('2026-06-01T09:00:00Z', '2026-06-01T11:00:00Z')]; // pokrywa 60 min
    expect(totalMinutes(intersectIntervals(outages, maintenance))).toBe(60);
  });

  it('zwraca zero, gdy okno nie pokrywa się z przestojem', () => {
    const outages = [iv('2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z')];
    const maintenance = [iv('2026-06-02T10:00:00Z', '2026-06-02T11:00:00Z')];
    expect(intersectIntervals(outages, maintenance)).toHaveLength(0);
  });

  it('obsługuje wiele okien przecinających jeden przestój', () => {
    const outages = [iv('2026-06-01T00:00:00Z', '2026-06-01T06:00:00Z')]; // 360 min
    const maintenance = [
      iv('2026-06-01T01:00:00Z', '2026-06-01T02:00:00Z'), // 60
      iv('2026-06-01T04:00:00Z', '2026-06-01T05:30:00Z'), // 90
    ];
    expect(totalMinutes(intersectIntervals(outages, maintenance))).toBe(150);
  });
});

describe('previousMonthUtc', () => {
  it('zwraca poprzedni miesiąc kalendarzowy', () => {
    const { periodStart, periodEnd } = previousMonthUtc(new Date('2026-07-10T03:00:00Z'));
    expect(periodStart.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('poprawnie przechodzi przez granicę roku', () => {
    const { periodStart, periodEnd } = previousMonthUtc(new Date('2026-01-05T03:00:00Z'));
    expect(periodStart.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('scenariusz łączny — trzy awarie w miesiącu', () => {
  /**
   * Regresja wobec starej implementacji, w której limit działał PER INCYDENT:
   * trzy awarie po 4320 min dawały 3 × 100% = 300% opłaty miesięcznej.
   * Teraz sumujemy przestój i stosujemy jeden próg.
   */
  it('sumuje przestoje i stosuje jeden próg, nie trzy', () => {
    const periodStart = new Date('2026-06-01T00:00:00Z');
    const periodEnd = new Date('2026-07-01T00:00:00Z');
    const exposureMin = totalMinutes([{ start: periodStart, end: periodEnd }]); // 43200

    const outages = mergeIntervals([
      iv('2026-06-05T00:00:00Z', '2026-06-05T12:00:00Z'), // 720 min
      iv('2026-06-12T00:00:00Z', '2026-06-12T12:00:00Z'), // 720 min
      iv('2026-06-20T00:00:00Z', '2026-06-20T12:00:00Z'), // 720 min
    ]);
    const downtimeMin = totalMinutes(outages);
    expect(downtimeMin).toBe(2160);

    const availabilityBp = Math.round(((exposureMin - downtimeMin) / exposureMin) * 10000);
    expect(availabilityBp).toBe(9500); // dokładnie 95,0%
    expect(tierPercent(availabilityBp)).toBe(25); // jedna rekompensata 25%, nie 300%
  });
});
