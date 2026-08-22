import { LiveReadinessService } from '../../src/admin-readiness/live-readiness.service';
import { MAKS_WIEK_PROBY_DNI } from '../../src/admin-readiness/proba-odtworzenia';
import { prisma, rozlacz, wyczyscBaze } from './setup';

/**
 * H-20 — bramka go-live przeciwko prawdziwej bazie.
 *
 * Sens tej pozycji nie polega na tym, że gdzieś w kodzie jest funkcja licząca
 * dni. Polega na tym, że **brak potwierdzonego odtworzenia zatrzymuje start
 * sprzedaży**. To da się sprawdzić tylko na złożeniu: zapytanie do bazy +
 * ocena + agregacja raportu gotowości.
 */

const PUSTE = {
  getSellerCompany: async () => ({}),
  getHostingNameservers: async () => [],
  getKsefSettings: async () => ({}),
  getClientConfig: async () => ({ webmailUrl: null }),
};

function readiness(): LiveReadinessService {
  return new LiveReadinessService(
    { get: () => undefined } as never,
    prisma() as never,
    PUSTE as never,
    { getCurrentMap: async () => ({}) } as never,
  );
}

async function zapiszProbe(over: Record<string, unknown> = {}) {
  const finished = (over.finishedAt as Date) ?? new Date();
  return prisma().restoreDrill.create({
    data: {
      startedAt: new Date(finished.getTime() - 200_000),
      finishedAt: finished,
      durationSec: 214,
      result: 'OK',
      objectName: 'verris-2026-08-19-0300.sql.gz',
      source: 'verris-backups/postgres',
      rowCounts: { User: 42, Plan: 3, Subscription: 40, Invoice: 120, Account: 41 },
      owner: 'dominik@hvln.pl',
      ...over,
    } as never,
  });
}

async function sprawdzenieDrilla() {
  const raport = await readiness().report();
  const check = raport.checks.find((c) => c.key === 'restore_drill');
  /**
   * Czy TA pozycja zatrzymuje start.
   *
   * Świadomie nie sprawdzamy `raport.go`, choć to kusi. W środowisku testowym
   * brakuje kluczy, Stripe'a i dokumentów prawnych, więc `go` jest fałszem
   * niezależnie od próby odtworzenia — asercja na nim przechodziłaby także po
   * wyłączeniu tej bramki. Test, który przechodzi na obu wersjach kodu, nie
   * mówi nic o żadnej z nich (patrz Z-01).
   */
  const blokujeZTegoPowodu = Boolean(check && check.blocking && check.status === 'fail');
  return { raport, check, blokujeZTegoPowodu };
}

const dniTemu = (n: number) => new Date(Date.now() - n * 86_400_000);

describe('H-20 — próba odtworzenia jako bramka go-live', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().restoreDrill.deleteMany({});
  });
  afterAll(rozlacz);

  it('BRAK próby zatrzymuje start sprzedaży', async () => {
    const { raport, check, blokujeZTegoPowodu } = await sprawdzenieDrilla();
    expect(check).toBeDefined();
    expect(check!.status).toBe('fail');
    expect(check!.blocking).toBe(true);
    // Cały sens pozycji: nie „ostrzeżenie", tylko NIE.
    expect(blokujeZTegoPowodu).toBe(true);
    expect(raport.go).toBe(false);
  });

  it('świeża udana próba zdejmuje tę blokadę', async () => {
    await zapiszProbe({ finishedAt: dniTemu(3) });
    const { check } = await sprawdzenieDrilla();
    expect(check!.status).toBe('ok');
    expect(check!.detail).toContain('dominik@hvln.pl');
  });

  it('próba po terminie ważności znów blokuje', async () => {
    await zapiszProbe({ finishedAt: dniTemu(MAKS_WIEK_PROBY_DNI + 5) });
    const { check, blokujeZTegoPowodu } = await sprawdzenieDrilla();
    expect(check!.status).toBe('fail');
    expect(blokujeZTegoPowodu).toBe(true);
  });

  it('nieudana próba blokuje, mimo wcześniejszej udanej', async () => {
    await zapiszProbe({ finishedAt: dniTemu(10) });
    await zapiszProbe({
      finishedAt: dniTemu(1),
      result: 'FAILED',
      notes: 'Odtworzenie bez danych: User (0 < 1)',
      rowCounts: { User: 0 },
    });
    const { check, blokujeZTegoPowodu } = await sprawdzenieDrilla();
    expect(check!.status).toBe('fail');
    expect(check!.detail).toContain('User (0 < 1)');
    expect(blokujeZTegoPowodu).toBe(true);
  });

  it('przed terminem ostrzega, ale nie zatrzymuje', async () => {
    await zapiszProbe({ finishedAt: dniTemu(MAKS_WIEK_PROBY_DNI - 2) });
    const { check, blokujeZTegoPowodu } = await sprawdzenieDrilla();
    expect(check!.status).toBe('warn');
    expect(blokujeZTegoPowodu).toBe(false);
    expect(check!.detail).toMatch(/Termin ważności upływa/);
  });

  it('baza odrzuca zapis bez właściciela', async () => {
    // D4 wymaga właściciela. Pusty napis spełniałby NOT NULL i nie spełniałby
    // reguły, dlatego ograniczenie jest na długości po przycięciu.
    await expect(zapiszProbe({ owner: '   ' })).rejects.toThrow();
  });

  it('baza odrzuca próbę o zerowym czasie trwania', async () => {
    // Zero sekund to zapis, nie pomiar — a czas odtworzenia jest tą liczbą,
    // którą trzeba znać PRZED awarią.
    await expect(zapiszProbe({ durationSec: 0 })).rejects.toThrow();
  });

  it('zapis niesie liczby wierszy — dowód, że baza nie była pusta', async () => {
    const p = await zapiszProbe();
    const z = await prisma().restoreDrill.findUniqueOrThrow({ where: { id: p.id } });
    const liczby = z.rowCounts as Record<string, number>;
    expect(liczby.User).toBe(42);
    expect(liczby.Invoice).toBe(120);
  });
});
