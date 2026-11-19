import { describe, expect, it, vi } from 'vitest';
import { eksportOdblokowany, KOMUNIKAT_EKSPORTU, MIESIECY_DO_EKSPORTU, odblokowujeEksport } from './eksport-odblokowany.js';

/** Paczka 134 – prawo do zabrania plików (decyzja 19.11.2026): 3 opłacone miesiące albo plan roczny. */
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('odblokowujeEksport', () => {
  const baza = { status: 'ACTIVE', interval: 'MONTH', isTrial: false, trialConvertedAt: null, createdAt: d('2026-08-01'), canceledAt: null } as const;

  it('miesięczny: 2 opłacone okresy – nie; 3 – tak (koniec okresu 1.11)', () => {
    expect(odblokowujeEksport({ ...baza, currentPeriodEnd: d('2026-10-01') })).toBe(false);
    expect(odblokowujeEksport({ ...baza, currentPeriodEnd: d('2026-11-01') })).toBe(true);
  });

  it('miesięczny: granica dzień wcześniej (31.10) jeszcze liczy się jako 3 miesiące, 30.10 – nie', () => {
    expect(odblokowujeEksport({ ...baza, currentPeriodEnd: d('2026-10-31') })).toBe(true);
    expect(odblokowujeEksport({ ...baza, currentPeriodEnd: d('2026-10-30') })).toBe(false);
  });

  it('miesięczny anulowany przed końcem 3. miesiąca – liczy się data anulowania', () => {
    expect(odblokowujeEksport({ ...baza, currentPeriodEnd: d('2026-11-01'), canceledAt: d('2026-10-15') })).toBe(false);
  });

  it('roczny – od razu; roczny anulowany po 5 dniach (zwrot) – nie', () => {
    expect(odblokowujeEksport({ ...baza, interval: 'YEAR', currentPeriodEnd: d('2027-08-01') })).toBe(true);
    expect(odblokowujeEksport({ ...baza, interval: 'YEAR', currentPeriodEnd: d('2027-08-01'), canceledAt: d('2026-08-06') })).toBe(false);
  });

  it('roczny anulowany dokładnie po 14 dniach – nie; po 15 – tak', () => {
    expect(odblokowujeEksport({ ...baza, interval: 'YEAR', currentPeriodEnd: d('2027-08-01'), canceledAt: d('2026-08-15') })).toBe(false);
    expect(odblokowujeEksport({ ...baza, interval: 'YEAR', currentPeriodEnd: d('2027-08-01'), canceledAt: d('2026-08-16') })).toBe(true);
  });

  it('brak końca okresu – nie', () => {
    expect(odblokowujeEksport({ ...baza, interval: 'YEAR', currentPeriodEnd: null })).toBe(false);
  });

  it('próba się nie liczy; po konwersji liczymy od trialConvertedAt', () => {
    expect(odblokowujeEksport({ ...baza, isTrial: true, currentPeriodEnd: d('2026-12-01') })).toBe(false);
    expect(odblokowujeEksport({ ...baza, isTrial: true, trialConvertedAt: d('2026-09-01'), currentPeriodEnd: d('2026-11-01') })).toBe(false);
    expect(odblokowujeEksport({ ...baza, isTrial: true, trialConvertedAt: d('2026-09-01'), currentPeriodEnd: d('2026-12-01') })).toBe(true);
  });

  it('wygasła usługa z 3 opłaconymi miesiącami nadal odblokowuje (pliki marki po końcu hostingu)', () => {
    expect(odblokowujeEksport({ ...baza, status: 'EXPIRED', currentPeriodEnd: d('2026-11-01'), canceledAt: d('2026-11-01') })).toBe(true);
  });
});

describe('stałe eksportu', () => {
  it('3 miesiące i komunikat dla klienta', () => {
    expect(MIESIECY_DO_EKSPORTU).toBe(3);
    expect(KOMUNIKAT_EKSPORTU).toBe('Pobranie strony w pliku ZIP jest dostępne po 3 opłaconych miesiącach hostingu albo od razu przy planie rocznym.');
  });
});

describe('eksportOdblokowany', () => {
  const wiersz = (nadpisz: Record<string, unknown> = {}) => ({
    status: 'ACTIVE',
    interval: 'MONTH',
    isTrial: false,
    trialConvertedAt: null,
    createdAt: d('2026-08-01'),
    currentPeriodEnd: d('2026-09-01'),
    canceledAt: null,
    ...nadpisz,
  });

  function atrapa(wiersze: unknown[]) {
    const findMany = vi.fn(async () => wiersze);
    return { prisma: { subscription: { findMany } } as never, findMany };
  }

  it('zapytanie tylko o HOSTING bez PENDING_PAYMENT, dla danego klienta', async () => {
    const { prisma, findMany } = atrapa([]);
    await eksportOdblokowany(prisma, 'u1');
    expect(findMany).toHaveBeenCalledTimes(1);
    const [arg] = findMany.mock.calls[0] as unknown as [{ where: unknown; select: Record<string, unknown> }];
    expect(arg.where).toEqual({ userId: 'u1', plan: { productKind: 'HOSTING' }, status: { notIn: ['PENDING_PAYMENT'] } });
    expect(arg.select).toMatchObject({
      status: true,
      interval: true,
      isTrial: true,
      trialConvertedAt: true,
      createdAt: true,
      currentPeriodEnd: true,
      canceledAt: true,
    });
  });

  it('brak usług – nie; wystarczy jedna usługa odblokowująca (any)', async () => {
    expect(await eksportOdblokowany(atrapa([]).prisma, 'u1')).toBe(false);
    expect(await eksportOdblokowany(atrapa([wiersz()]).prisma, 'u1')).toBe(false);
    expect(await eksportOdblokowany(atrapa([wiersz(), wiersz({ interval: 'YEAR', currentPeriodEnd: d('2027-08-01') })]).prisma, 'u1')).toBe(true);
  });
});
