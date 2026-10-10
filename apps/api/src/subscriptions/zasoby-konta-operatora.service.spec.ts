import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { raportDoZapisu } from '../telemetry/faulty-lve.js';
import { ZasobyKontaOperatoraService } from './zasoby-konta-operatora.service.js';

/** F2.6 — „Zasoby i diagnoza 508”: faulty, limity, inody, wolne SQL i 5xx obok siebie. */
const KONTO = {
  daUsername: 'u1',
  domain: 'klient.pl',
  status: 'ACTIVE',
  cpuLimit: 200,
  ramLimitMb: 2048,
  ioLimitKbps: 10240,
  iopsLimit: 1024,
  entryProcesses: 30,
  nprocLimit: 100,
  server: {
    lveFaults: raportDoZapisu({ windows: [{ hours: 24, accounts: [{ username: 'u1', ep: 17 }] }, { hours: 168, accounts: [{ username: 'u1', ep: 40, pmem: 3 }] }] }),
    lveFaultsAt: new Date(),
  },
};

function zbuduj(konto: unknown = KONTO) {
  const prisma = { account: { findUnique: vi.fn(async () => konto) } };
  const directAdmin = {
    getConnectionInfo: vi.fn(async () => ({ inodes: { used: 180_000, limit: 250_000 }, fetchError: null })),
  };
  const slowSql = {
    status: vi.fn(async () => ({ wToku: false, odczytano: null, grupy: [{ sql: 'SELECT ?', liczba: 3 }], blad: null })),
    odswiez: vi.fn(async () => ({})),
  };
  const siteStats = {
    status: vi.fn(async () => ({ domena: 'klient.pl', wToku: false, statystyki: { ruch: [{ dzien: '2026-10-10', bledy5xx: 12 }] }, blad: null })),
    odswiez: vi.fn(async () => ({})),
  };
  const svc = new ZasobyKontaOperatoraService(prisma as never, directAdmin as never, slowSql as never, siteStats as never);
  return { svc, prisma, directAdmin, slowSql, siteStats };
}

describe('ZasobyKontaOperatoraService', () => {
  it('audyt Fal 2: konto zawieszone — faulty jako brak danych (agent raportuje tylko konta ACTIVE), nie „0 odbić”', async () => {
    const { svc } = zbuduj({ ...KONTO, daUsername: 'zawieszony', status: 'SUSPENDED' });
    const w = await svc.widok('s1', 'k1');
    expect(w.faulty).toMatchObject({ doba: null, tydzien: null, pozaRaportem: true });
  });

  it('widok: faulty 24 h i 7 dni konta, limity efektywne, inody, wolne SQL i 5xx — wszystko dla właściciela', async () => {
    const { svc, directAdmin, slowSql, siteStats } = zbuduj();
    const w = await svc.widok('s1', 'wlasciciel');
    expect(w.faulty.doba).toMatchObject({ ep: 17, pmem: 0 });
    expect(w.faulty.tydzien).toMatchObject({ ep: 40, pmem: 3 });
    expect(w.limity).toEqual({ cpuProcent: 200, ep: 30, nproc: 100, ramMb: 2048, ioKbps: 10240, iops: 1024 });
    expect(w.inody).toEqual({ uzyte: 180_000, limit: 250_000, blad: null });
    expect(w.wolneSql.grupy).toHaveLength(1);
    expect(w.strona).toMatchObject({ domena: 'klient.pl', statystyki: { ruch: [{ bledy5xx: 12 }] } });
    expect(directAdmin.getConnectionInfo).toHaveBeenCalledWith('s1', 'wlasciciel');
    expect(slowSql.status).toHaveBeenCalledWith('s1', 'wlasciciel');
    expect(siteStats.status).toHaveBeenCalledWith('s1', 'wlasciciel', 'klient.pl');
  });

  it('błąd węzła przy statystykach strony nie gasi reszty — sekcja ma błąd, nie pusty wynik', async () => {
    const { svc, siteStats } = zbuduj();
    siteStats.status.mockRejectedValueOnce(new BadRequestException('DirectAdmin API error: timeout'));
    const w = await svc.widok('s1', 'wlasciciel');
    expect(w.strona).toMatchObject({ domena: 'klient.pl', blad: expect.any(String) });
    expect(w.wolneSql.grupy).toHaveLength(1);
  });

  it('brak raportu faultów z węzła (stary agent) = brak danych, nie zera', async () => {
    const { svc } = zbuduj({ ...KONTO, server: { lveFaults: null, lveFaultsAt: null } });
    const w = await svc.widok('s1', 'wlasciciel');
    expect(w.faulty).toMatchObject({ odczytano: null, doba: null, tydzien: null });
  });

  it('brak konta → 404', async () => {
    const { svc } = zbuduj(null);
    await expect(svc.widok('s1', 'w')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('odczytaj: zleca SLOW_SQL i SITE_STATS jako operator; odczyt w toku to nie błąd, inny błąd — tak', async () => {
    const { svc, slowSql, siteStats } = zbuduj();
    slowSql.odswiez.mockRejectedValueOnce(new ConflictException('Odczyt jest już w toku'));
    await svc.odczytaj('s1', 'wlasciciel', 'operator');
    expect(slowSql.odswiez).toHaveBeenCalledWith('s1', 'wlasciciel', 'operator');
    expect(siteStats.odswiez).toHaveBeenCalledWith('s1', 'wlasciciel', 'klient.pl', 'operator');
    siteStats.odswiez.mockRejectedValueOnce(new BadRequestException('Konto hostingowe nie jest aktywne.'));
    await expect(svc.odczytaj('s1', 'wlasciciel', 'operator')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('F2.6 — zlecający odczyt z karty operatora', () => {
  const konto = { id: 'acc1', serverId: 'srv1', daUsername: 'u1', status: 'ACTIVE' };
  const prisma = () => ({
    subscription: { findFirst: vi.fn(async () => ({ account: konto })) },
    nodeTask: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
  });

  it('SLOW_SQL: requestedById = operator, a gdy brak — właściciel (jak dotąd u klienta)', async () => {
    const { SlowSqlService } = await import('./slow-sql.service.js');
    const p = prisma();
    await new SlowSqlService(p as never).odswiez('s1', 'wlasciciel', 'operator');
    await new SlowSqlService(p as never).odswiez('s1', 'wlasciciel');
    expect(p.nodeTask.create.mock.calls.map((c) => (c as unknown as [{ data: { requestedById: string } }])[0].data.requestedById)).toEqual(['operator', 'wlasciciel']);
  });

  it('SITE_STATS: requestedById = operator', async () => {
    const { SiteStatsService } = await import('./site-stats.service.js');
    const p = prisma();
    const da = { assertDomainOwnedBySubscription: vi.fn(async () => 'klient.pl') };
    await new SiteStatsService(p as never, da as never).odswiez('s1', 'wlasciciel', 'klient.pl', 'operator');
    expect((p.nodeTask.create.mock.calls[0] as unknown as [{ data: { requestedById: string; payload: unknown } }])[0].data).toMatchObject({
      requestedById: 'operator',
      payload: { daUser: 'u1', domain: 'klient.pl' },
    });
  });
});
