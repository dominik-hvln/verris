import {
  dniPrac,
  dniWstecz,
  godzinyWstecz,
  paskiDni,
  procentDostepnosci,
  scalPoKluczu,
  stanDnia,
  stanDniaZPracami,
  uslugaDlaRodzaju,
  uslugaSondy,
  zbijDuplikaty,
  type ZdarzenieDto,
} from './status-historia.js';

const k = (total: number, success: number, latencyWeighted = 0) => ({ total, success, latencyWeighted });

describe('status — paski dni i dostępność z surowych próbek', () => {
  it('dzień bez próbek to NO_DATA, a nie „działa” — nic nie jest zmyślane', () => {
    const [d] = paskiDni(['2026-10-07'], new Map());
    expect(d).toEqual({ date: '2026-10-07', state: 'NO_DATA', uptimePct: null, avgLatencyMs: null });
    expect(procentDostepnosci([undefined])).toBeNull();
  });

  it('progi dnia: ≥99,9 działa, ≥99 spowolnienie, niżej awaria', () => {
    expect(stanDnia(k(2880, 2880))).toBe('OK');
    expect(stanDnia(k(2880, 2878))).toBe('OK'); // 99,93%
    expect(stanDnia(k(1000, 999))).toBe('OK'); // dokładnie 99,9%
    expect(stanDnia(k(2880, 2870))).toBe('DEGRADED'); // 99,65%
    expect(stanDnia(k(1000, 990))).toBe('DEGRADED'); // dokładnie 99%
    expect(stanDnia(k(2880, 2800))).toBe('DOWN'); // 97,2%
  });

  it('procent jest obcinany, nie zaokrąglany w górę do 100', () => {
    expect(procentDostepnosci([k(100000, 99996)])).toBe(99.99);
    expect(procentDostepnosci([k(100, 100)])).toBe(100);
    expect(procentDostepnosci([k(3, 2)])).toBe(66.66);
  });

  it('scala sondy jednej usługi po dniu i liczy średni czas ważony liczbą próbek', () => {
    const m = scalPoKluczu([
      { key: '2026-10-06', total: 100, success: 100, latencyWeighted: 100 * 200 },
      { key: '2026-10-06', total: 300, success: 297, latencyWeighted: 300 * 100 },
      { key: '2026-10-05', total: 10, success: 10, latencyWeighted: 10 },
    ]);
    const pasek = paskiDni(['2026-10-05', '2026-10-06', '2026-10-07'], m);
    expect(pasek.map((d) => d.state)).toEqual(['OK', 'DEGRADED', 'NO_DATA']);
    expect(pasek[1]).toMatchObject({ uptimePct: 99.25, avgLatencyMs: 125 });
  });

  it('dniWstecz daje n kolejnych unikalnych dni także przez zmianę czasu (25.10.2026)', () => {
    const dni = dniWstecz('2026-11-02', 90);
    expect(dni).toHaveLength(90);
    expect(new Set(dni).size).toBe(90);
    expect(dni[89]).toBe('2026-11-02');
    expect(dni[0]).toBe('2026-08-05');
    expect(dni).toContain('2026-10-25');
  });

  it('godzinyWstecz kończy się na bieżącej godzinie UTC', () => {
    const g = godzinyWstecz(new Date('2026-10-07T10:42:11Z'), 24);
    expect(g).toHaveLength(24);
    expect(g[23]).toBe('2026-10-07T10:00:00.000Z');
    expect(g[0]).toBe('2026-10-06T11:00:00.000Z');
  });

  it('SSH i DA_API nie są usługami publicznymi', () => {
    expect(uslugaDlaRodzaju('SSH')).toBeNull();
    expect(uslugaDlaRodzaju('DA_API')).toBeNull();
    expect(uslugaDlaRodzaju('HTTPS')?.name).toBe('Strony klientów');
    expect(uslugaDlaRodzaju('IMAP')?.name).toBe('Poczta');
  });
});

describe('status — zdarzenia dla klienta', () => {
  const z = (id: string, od: string, do_: string | null, extra: Partial<ZdarzenieDto> = {}): ZdarzenieDto => ({
    id,
    service: 'Strony klientów',
    severity: 'MAJOR',
    status: do_ ? 'RESOLVED' : 'OPEN',
    title: 'Awaria: Strony klientów',
    publicMessage: null,
    startedAt: od,
    resolvedAt: do_,
    durationMinutes: null,
    ...extra,
  });

  it('HTTP + HTTPS tego samego węzła to jedno zdarzenie z sumą przedziału', () => {
    const w = zbijDuplikaty([
      z('a', '2026-10-07T14:02:00Z', '2026-10-07T14:19:00Z'),
      z('b', '2026-10-07T14:03:00Z', '2026-10-07T14:20:00Z'),
    ]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      startedAt: '2026-10-07T14:02:00Z',
      resolvedAt: '2026-10-07T14:20:00Z',
      durationMinutes: 18,
      status: 'RESOLVED',
    });
  });

  it('osobne w czasie awarie i różne usługi zostają osobno; trwające scala się jako OPEN', () => {
    const w = zbijDuplikaty([
      z('a', '2026-10-01T10:00:00Z', '2026-10-01T10:10:00Z'),
      z('b', '2026-10-07T10:00:00Z', null),
      z('c', '2026-10-07T10:05:00Z', '2026-10-07T10:06:00Z'),
      z('d', '2026-10-07T10:00:00Z', null, { service: 'Poczta', title: 'Zakłócenie: Poczta' }),
    ]);
    expect(w).toHaveLength(3);
    expect(w.find((x) => x.service === 'Strony klientów' && x.status === 'OPEN')).toBeTruthy();
    expect(w.filter((x) => x.service === 'Strony klientów')).toHaveLength(2);
  });
});

describe('status — sondy platformy i planowane prace', () => {
  it('sonda bez węzła trafia do usługi platformy po grupie; z węzłem — po rodzaju', () => {
    expect(uslugaSondy({ serverId: null, grupa: 'panel', kind: 'HTTPS' })?.name).toBe('Panel klienta');
    expect(uslugaSondy({ serverId: null, grupa: 'www', kind: 'HTTPS' })?.name).toBe('Strona verris.pl');
    expect(uslugaSondy({ serverId: null, grupa: 'api', kind: 'HTTP' })?.name).toBe('API');
    // grupa na sondzie węzła nie przenosi jej do platformy; nieznana grupa = sonda wewnętrzna
    expect(uslugaSondy({ serverId: 's1', grupa: 'panel', kind: 'HTTPS' })?.name).toBe('Strony klientów');
    expect(uslugaSondy({ serverId: null, grupa: null, kind: 'HTTPS' })).toBeNull();
    expect(uslugaSondy({ serverId: null, grupa: 'xyz', kind: 'HTTPS' })).toBeNull();
  });

  it('stan dnia z pracami: działa/spowolnienie → prace, awaria i brak danych bez zmian', () => {
    expect(stanDniaZPracami('OK', true)).toBe('MAINTENANCE');
    expect(stanDniaZPracami('DEGRADED', true)).toBe('MAINTENANCE');
    expect(stanDniaZPracami('DOWN', true)).toBe('DOWN');
    expect(stanDniaZPracami('NO_DATA', true)).toBe('NO_DATA');
    expect(stanDniaZPracami('OK', false)).toBe('OK');
  });

  it('dniPrac liczy dni czasu polskiego, a okno do północy nie zahacza o następny dzień', () => {
    const dni = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];
    // 23:30–00:30 czasu polskiego (CEST = UTC+2) → dwa dni
    expect([...dniPrac([{ od: new Date('2026-10-04T21:30:00Z'), do: new Date('2026-10-04T22:30:00Z') }], dni)]).toEqual([
      '2026-10-04',
      '2026-10-05',
    ]);
    // kończy się równo o północy polskiej → tylko 6.10
    expect([...dniPrac([{ od: new Date('2026-10-06T20:00:00Z'), do: new Date('2026-10-06T22:00:00Z') }], dni)]).toEqual([
      '2026-10-06',
    ]);
  });

  it('pasek dni: dzień prac bez awarii ma stan MAINTENANCE, dzień prac z awarią zostaje awarią', () => {
    const m = new Map([
      ['2026-10-05', k(1000, 1000)],
      ['2026-10-06', k(1000, 900)],
      ['2026-10-07', k(1000, 1000)],
    ]);
    const pasek = paskiDni(['2026-10-05', '2026-10-06', '2026-10-07'], m, new Set(['2026-10-05', '2026-10-06']));
    expect(pasek.map((d) => d.state)).toEqual(['MAINTENANCE', 'DOWN', 'OK']);
    expect(pasek[0].uptimePct).toBe(100);
  });
});
