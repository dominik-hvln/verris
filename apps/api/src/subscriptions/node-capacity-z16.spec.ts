import {
  DOMYSLNA_KROTNOSC_AUTOSKALOWANIA,
  krotnoscAutoskalowania,
  MAKS_KROTNOSC_AUTOSKALOWANIA,
  PolitykaPojemnosci,
  wolneDoZadysponowania,
} from './node-capacity';

/**
 * Z-16 — ile węzeł może jeszcze zadysponować i jaka krotność wolno kontu urosnąć.
 *
 * Węzeł odniesienia jak w PB-01: Hetzner AX102 — 32 wątki, 128 GB RAM,
 * 1,92 TB dysku użytecznego.
 */

const WEZEL = { cpu: 3200, ramMb: 131072, diskMb: 1966080 };

function polityka(over: Partial<PolitykaPojemnosci> = {}): PolitykaPojemnosci {
  return {
    overcommitCpu: 1,
    overcommitRam: 1,
    overcommitDisk: 1,
    reservedHeadroomPercent: 0,
    ...over,
  };
}

describe('Z-16 — wolna pojemność węzła dla autoskalowania', () => {
  it('pusty węzeł oddaje całą pojemność', () => {
    const w = wolneDoZadysponowania({
      fizyczna: WEZEL,
      sprzedane: { cpu: 0, ramMb: 0, diskMb: 0 },
      zuzycie: { cpu: 0, ramMb: 0, diskMb: 0 },
      polityka: polityka(),
    });
    expect(w).toEqual(WEZEL);
  });

  it('odejmuje to, co węzeł już komuś obiecał', () => {
    const w = wolneDoZadysponowania({
      fizyczna: WEZEL,
      sprzedane: { cpu: 1000, ramMb: 100 * 1024, diskMb: 0 },
      zuzycie: { cpu: 0, ramMb: 0, diskMb: 0 },
      polityka: polityka(),
    });
    expect(w.cpu).toBe(2200);
    expect(w.ramMb).toBe(28 * 1024);
  });

  it('nadsubskrypcja powiększa pulę do rozdania', () => {
    const bez = wolneDoZadysponowania({
      fizyczna: WEZEL,
      sprzedane: { cpu: 0, ramMb: 100 * 1024, diskMb: 0 },
      zuzycie: { cpu: 0, ramMb: 0, diskMb: 0 },
      polityka: polityka(),
    });
    const z4x = wolneDoZadysponowania({
      fizyczna: WEZEL,
      sprzedane: { cpu: 0, ramMb: 100 * 1024, diskMb: 0 },
      zuzycie: { cpu: 0, ramMb: 0, diskMb: 0 },
      polityka: polityka({ overcommitRam: 4 }),
    });
    expect(z4x.ramMb).toBeGreaterThan(bez.ramMb);
    expect(z4x.ramMb).toBe(4 * WEZEL.ramMb - 100 * 1024);
  });

  it('NIGDY nie zwraca wartości ujemnych — brak miejsca to „nie rośnij", nie „zabierz"', () => {
    const w = wolneDoZadysponowania({
      fizyczna: WEZEL,
      sprzedane: { cpu: 99999, ramMb: 999 * 1024, diskMb: 99 * 1024 * 1024 },
      zuzycie: { cpu: 0, ramMb: 0, diskMb: 0 },
      polityka: polityka(),
    });
    expect(w.cpu).toBe(0);
    expect(w.ramMb).toBe(0);
    expect(w.diskMb).toBe(0);
  });

  it('zasób realnie wyczerpany jest zamknięty, choćby w księdze coś zostało', () => {
    const w = wolneDoZadysponowania({
      fizyczna: WEZEL,
      sprzedane: { cpu: 0, ramMb: 0, diskMb: 0 }, // księga pusta
      zuzycie: { cpu: 0, ramMb: WEZEL.ramMb * 0.95, diskMb: 0 }, // maszyna zjedzona
      polityka: polityka({ overcommitRam: 4, reservedHeadroomPercent: 20 }),
    });
    expect(w.ramMb).toBe(0);
    // CPU i dysk nadal wolne — blokada jest per zasób, nie na cały węzeł.
    expect(w.cpu).toBeGreaterThan(0);
    expect(w.diskMb).toBeGreaterThan(0);
  });

  it('brak telemetrii degraduje nadsubskrypcję, ale nie zamyka węzła', () => {
    const w = wolneDoZadysponowania({
      fizyczna: WEZEL,
      sprzedane: { cpu: 0, ramMb: 64 * 1024, diskMb: 0 },
      zuzycie: null,
      polityka: polityka({ overcommitRam: 4 }),
    });
    // 1,0× zamiast 4×: zostaje 128 − 64 = 64 GB, a nie 512 − 64.
    expect(w.ramMb).toBe(64 * 1024);
  });

  it('węzeł bez zaraportowanej pojemności nie oddaje niczego', () => {
    const w = wolneDoZadysponowania({
      fizyczna: { cpu: 0, ramMb: 0, diskMb: 0 },
      sprzedane: { cpu: 0, ramMb: 0, diskMb: 0 },
      zuzycie: null,
      polityka: polityka(),
    });
    expect(w).toEqual({ cpu: 0, ramMb: 0, diskMb: 0 });
  });
});

describe('Z-16 — krotność autoskalowania bierze się z planu, nie z ukrytego sufitu', () => {
  it('sufit oferty Verris jest teraz osiągalny', () => {
    // Oferta: 2 vCPU → 24 (12×), 8 GB → 64 (8×), 50 GB → 1000 GB (20×).
    // Przed Z-16 silnik przycinał wszystko do 10×, więc CPU i dysk nie dowoziły.
    expect(krotnoscAutoskalowania(12)).toBe(12);
    expect(krotnoscAutoskalowania(8)).toBe(8);
    expect(krotnoscAutoskalowania(20)).toBe(20);
  });

  it('stary sufit 10× nie obowiązuje', () => {
    expect(krotnoscAutoskalowania(20)).toBeGreaterThan(10);
  });

  it('granica nadal istnieje — jako ochrona przed literówką w planie', () => {
    expect(krotnoscAutoskalowania(1000)).toBe(MAKS_KROTNOSC_AUTOSKALOWANIA);
  });

  it('bezsensowna wartość w planie daje wartość domyślną, nie zero', () => {
    expect(krotnoscAutoskalowania(0)).toBe(DOMYSLNA_KROTNOSC_AUTOSKALOWANIA);
    expect(krotnoscAutoskalowania(-5)).toBe(DOMYSLNA_KROTNOSC_AUTOSKALOWANIA);
    expect(krotnoscAutoskalowania(Number.NaN)).toBe(DOMYSLNA_KROTNOSC_AUTOSKALOWANIA);
  });

  it('krotność 1 znaczy „bez autoskalowania", nie „domyślna"', () => {
    expect(krotnoscAutoskalowania(1)).toBe(1);
  });
});
