import { DirectAdminClient } from '@verris/directadmin-sdk';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DirectAdminService } from './directadmin.service.js';
import { PLANY_Z_PAKIETEM_DA } from './da-package-spec.js';

/**
 * Operacje administracyjne na węźle w DirectAdminService: klient admina, test klucza,
 * synchronizacja pakietów z planami i markowe NS. Samo zakładanie/zawieszanie/usuwanie
 * kont DA mieszka poza tym serwisem (provisioning/subscriptions) — tu pilnujemy, że:
 *  - klient admina weryfikuje TLS, chyba że węzeł jawnie z tego zrezygnował,
 *  - test połączenia nie mówi „OK”, gdy klucz nie ma zakresu pakietów/kont (provisioning by padł),
 *  - błąd DA przy pakiecie przerywa synchronizację i nie raportuje planów jako zsynchronizowanych,
 *  - NS: „already” to pominięcie, a nie awaria; inne błędy są liczone.
 */
function serwis(server: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  const prisma = {
    server: { findUnique: vi.fn(async () => server) },
    account: { findMany: vi.fn(async () => []) },
    plan: { findMany: vi.fn(async () => []) },
    ...extra,
  };
  const crypto = { decrypt: vi.fn((v: string) => `plain:${v}`) };
  return { svc: new DirectAdminService(prisma as never, crypto as never, {} as never, {} as never), prisma };
}
const WEZEL = { id: 'n1', daHost: 'da.wezel.pl', daPort: 2222, daUsername: 'admin', daPasswordEnc: 'enc', daUseTls: true, daAllowInvalidCert: false };
const klient = () => new DirectAdminClient({ host: 'da.test', port: 2222, username: 'admin', loginKey: 'x', secure: true });

describe('Klient admina węzła (getClientForServer)', () => {
  it('weryfikacja certyfikatu domyślnie włączona; klucz odszyfrowany', async () => {
    const { svc } = serwis(WEZEL);
    const c = await svc.getClientForServer('n1');
    expect((c as unknown as { config: Record<string, unknown> }).config).toMatchObject({
      host: 'da.wezel.pl', port: 2222, username: 'admin', loginKey: 'plain:enc', secure: true, rejectUnauthorized: true,
    });
  });

  it('wyłączenie weryfikacji tylko przy jawnym daAllowInvalidCert', async () => {
    const { svc } = serwis({ ...WEZEL, daAllowInvalidCert: true });
    const c = await svc.getClientForServer('n1');
    expect((c as unknown as { config: Record<string, unknown> }).config.rejectUnauthorized).toBe(false);
  });

  it('brak konfiguracji DA → 400; brak węzła → 404', async () => {
    await expect(serwis({ ...WEZEL, daPasswordEnc: null }).svc.getClientForServer('n1')).rejects.toThrow('nie jest jeszcze skonfigurowany');
    await expect(serwis(null).svc.getClientForServer('n1')).rejects.toThrow('Nie znaleziono węzła.');
  });
});

describe('Test połączenia (zakres klucza)', () => {
  function zKlientem() {
    const { svc } = serwis(WEZEL);
    const c = klient();
    vi.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    const domeny = vi.spyOn(c, 'getDomains').mockResolvedValue(['a.pl', 'b.pl']);
    const pakiety = vi.spyOn(c, 'listUserPackages').mockResolvedValue(['starter', 'pro']);
    const konta = vi.spyOn(c, 'listAccounts').mockResolvedValue(['u1']);
    return { svc, domeny, pakiety, konta };
  }

  it('pełny zakres → ok', async () => {
    const t = zKlientem();
    expect(await t.svc.testConnection('n1')).toEqual({ ok: true, sampleCount: 2, scope: { packages: true, accounts: true, packageCount: 2 } });
  });

  it('klucz bez zakresu pakietów → ok:false z nazwą brakującego zakresu (a nie „działa”)', async () => {
    const t = zKlientem();
    t.pakiety.mockRejectedValue(new Error('DirectAdmin API Error: You do not have access'));
    const wynik = await t.svc.testConnection('n1');
    expect(wynik).toMatchObject({ ok: false, sampleCount: 2, scope: { packages: false, accounts: true, packageCount: null } });
    expect(wynik.error).toContain('pakiety: DirectAdmin API Error: You do not have access');
  });

  it('brak łączności → ok:false, zakresu nawet nie sprawdzamy', async () => {
    const t = zKlientem();
    t.domeny.mockRejectedValue(new Error('connect ECONNREFUSED'));
    expect(await t.svc.testConnection('n1')).toEqual({ ok: false, error: 'connect ECONNREFUSED' });
    expect(t.pakiety).not.toHaveBeenCalled();
  });

  it('węzeł bez konfiguracji DA → ok:false z opisem, bez wyjątku', async () => {
    const { svc } = serwis({ ...WEZEL, daHost: null });
    expect(await svc.testConnection('n1')).toMatchObject({ ok: false, error: expect.stringContaining('nie jest jeszcze skonfigurowany') });
  });
});

describe('Synchronizacja pakietów DA z planami', () => {
  const plan = (slug: string) => ({
    slug, diskLimitMb: 10240, includedTransferGb: 100, cpuLimit: 100, ramLimitMb: 1024, ioLimitKbps: 10240,
    iopsLimit: 1024, entryProcesses: 20, nprocLimit: 100, sshAccess: false, productKind: 'HOSTING',
  });

  it('upsert dla każdego aktywnego planu w kolejności; tylko aktywne plany', async () => {
    const plans = { findMany: vi.fn(async () => [plan('starter'), plan('pro')]) };
    const { svc } = serwis(WEZEL, { plan: plans });
    const c = klient();
    vi.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    const upsert = vi.spyOn(c, 'upsertUserPackage').mockResolvedValue(undefined);
    expect(await svc.syncPlanPackagesForServer('n1', { nadpisz: true })).toEqual({ synced: ['starter', 'pro'] });
    expect(plans.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, productKind: { in: ['HOSTING', 'EMAIL'] } } }));
    expect(upsert.mock.calls.map(([spec]) => spec.name)).toEqual(['starter', 'pro']);
  });

  it('Q-05: pakiet DA, audyt węzła i stan LVE tylko dla planów z kontem na węźle — nie dla e-mail marketingu', () => {
    expect(PLANY_Z_PAKIETEM_DA).toEqual({ isActive: true, productKind: { in: ['HOSTING', 'EMAIL'] } });
    for (const plik of ['directadmin.service.ts', 'node-audit.service.ts', 'node-tasks.service.ts']) {
      const src = readFileSync(resolve(import.meta.dirname, plik), 'utf8');
      expect(src).not.toMatch(/plan\.findMany\(\{\s*where:\s*\{\s*isActive:\s*true\s*\}/);
      expect(src).toContain('where: PLANY_Z_PAKIETEM_DA');
    }
  });

  it('domyślnie tylko brakujące — istniejącego pakietu nie zapisuje (t1 02.10: zapis nałożył ssh=OFF na konta)', async () => {
    const { svc } = serwis(WEZEL, { plan: { findMany: vi.fn(async () => [plan('starter'), plan('pro')]) } });
    const c = klient();
    vi.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    vi.spyOn(c, 'listUserPackages').mockResolvedValue(['starter']);
    const upsert = vi.spyOn(c, 'upsertUserPackage').mockResolvedValue(undefined);
    expect(await svc.syncPlanPackagesForServer('n1')).toEqual({ synced: ['pro'] });
    expect(upsert.mock.calls.map(([spec]) => spec.name)).toEqual(['pro']);
  });

  it('błąd DA na pierwszym pakiecie → wyjątek, kolejne nie są wysyłane', async () => {
    const { svc } = serwis(WEZEL, { plan: { findMany: vi.fn(async () => [plan('starter'), plan('pro')]) } });
    const c = klient();
    vi.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    const upsert = vi.spyOn(c, 'upsertUserPackage').mockRejectedValue(new Error('DirectAdmin API Error: invalid quota'));
    await expect(svc.syncPlanPackagesForServer('n1', { nadpisz: true })).rejects.toThrow('invalid quota');
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('Markowe NS na węźle', () => {
  function ns(obecne: { ns1: string; ns2: string }, konta: string[]) {
    const { svc } = serwis(WEZEL, { account: { findMany: vi.fn(async () => konta.map((daUsername) => ({ daUsername, subscriptionId: `s-${daUsername}`, userId: 'u1' }))) } });
    const c = klient();
    Object.assign(c, { client: { get: vi.fn(async () => ({ data: obecne })), post: vi.fn() } });
    vi.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    const admin = vi.spyOn(c, 'setAdminDefaultNameservers').mockResolvedValue(undefined);
    const reseller = vi.spyOn(c, 'setResellerDefaultNameservers').mockResolvedValue(undefined);
    const user = vi.spyOn(c, 'setUserNameservers').mockImplementation(async (u: string) => {
      if (u === 'juz') throw new Error('Nameservers already set');
      if (u === 'zly') throw new Error('User is suspended');
    });
    const strefy = vi.spyOn(svc, 'przepiszNsWStrefachKonta').mockResolvedValue(0);
    return { svc, admin, reseller, user, strefy };
  }

  it('już ustawione (wielkość liter bez znaczenia) → unchanged, bez zapisu Admin Settings', async () => {
    const t = ns({ ns1: 'NS1.Verris.pl', ns2: 'ns2.verris.pl' }, []);
    const wynik = await t.svc.applyBrandedNameserversOnNode('n1', ' ns1.verris.pl ', 'ns2.verris.pl');
    expect(wynik.adminSettings).toBe('unchanged');
    expect(t.admin).not.toHaveBeenCalled();
    expect(t.reseller).toHaveBeenCalledWith('ns1.verris.pl', 'ns2.verris.pl');
  });

  it('konta: sukces / „already” = pominięte / inny błąd = nieudane', async () => {
    const t = ns({ ns1: 'stary1.pl', ns2: 'stary2.pl' }, ['ok', 'juz', 'zly']);
    const wynik = await t.svc.applyBrandedNameserversOnNode('n1', 'ns1.verris.pl', 'ns2.verris.pl');
    expect(wynik).toMatchObject({ adminSettings: 'updated', nameServerDefaults: 'updated', hostingAccounts: { updated: 1, skipped: 1, failed: 1 } });
    expect(t.admin).toHaveBeenCalledWith('ns1.verris.pl', 'ns2.verris.pl');
  });

  it('błąd zapisu Admin Settings → „error” z treścią, konta i tak synchronizowane', async () => {
    const t = ns({ ns1: '', ns2: '' }, ['ok']);
    t.admin.mockRejectedValue(new Error('DirectAdmin API Error: Access denied'));
    const wynik = await t.svc.applyBrandedNameserversOnNode('n1', 'ns1.verris.pl', 'ns2.verris.pl');
    expect(wynik).toMatchObject({ adminSettings: 'error', adminSettingsDetail: 'DirectAdmin API Error: Access denied', hostingAccounts: { updated: 1 } });
  });

  it('węzeł bez DA albo puste NS → skipped, bez żadnego wywołania DA', async () => {
    const t = ns({ ns1: '', ns2: '' }, ['ok']);
    expect((await t.svc.applyBrandedNameserversOnNode('n1', 'ns1.verris.pl', ' ')).adminSettings).toBe('skipped');
    expect((await serwis({ ...WEZEL, daHost: null }).svc.applyBrandedNameserversOnNode('n1', 'a.pl', 'b.pl')).adminSettings).toBe('skipped');
    expect(t.user).not.toHaveBeenCalled();
  });
});

describe('Markowe NS — przepisanie NS w istniejących strefach (H-16, t2 13.10)', () => {
  type R = { id: string; name: string; type: string; value: string; ttl: number | null };
  function strefa(rekordy: Array<Omit<R, 'id' | 'ttl'>>, o: { nieZapisuj?: boolean } = {}) {
    const { svc } = serwis(WEZEL);
    let zona: R[] = rekordy.map((r, i) => ({ ...r, id: String(i), ttl: 3600 }));
    vi.spyOn(svc, 'listHostingDomainsForSubscription').mockResolvedValue({ domains: [{ name: 'pb55.d3.hvln.pl' }], primaryDomain: 'pb55.d3.hvln.pl', fetchError: null } as never);
    vi.spyOn(svc, 'listHostingDnsRecords').mockImplementation(async (_s, _u, domain) => ({ domain: domain ?? null, records: zona, fetchError: null }));
    const dodaj = vi.spyOn(svc, 'createHostingDnsRecord').mockImplementation(async (_s, _u, r) => {
      if (!o.nieZapisuj) zona = [...zona, { id: 'n', name: r.name, type: r.type, value: r.value, ttl: 3600 }];
      return { ok: true as const };
    });
    const usun = vi.spyOn(svc, 'deleteHostingDnsRecord').mockImplementation(async (_s, _u, r) => {
      zona = zona.filter((z) => !(z.type === r.type && z.value === r.value && z.name === r.name));
      return { ok: true as const };
    });
    return { svc, dodaj, usun, ns: () => zona.filter((z) => z.type === 'NS').map((z) => z.value).sort() };
  }

  it('stare nazwy z naszej bazy → dodane nowe, usunięte stare', async () => {
    const t = strefa([
      { name: 'pb55.d3.hvln.pl.', type: 'NS', value: 'ns1.t2.verris.pl.' },
      { name: 'pb55.d3.hvln.pl.', type: 'NS', value: 'ns2.t2.verris.pl.' },
      { name: 'pb55.d3.hvln.pl.', type: 'A', value: '2.28.204.249' },
    ]);
    await expect(t.svc.przepiszNsWStrefachKonta('s1', 'u1', 'ns3.verris.pl', 'ns4.verris.pl')).resolves.toBe(1);
    expect(t.ns()).toEqual(['ns3.verris.pl.', 'ns4.verris.pl.']);
  });

  it('własna delegacja klienta (NS spoza naszej bazy) albo już poprawne NS → bez zmian', async () => {
    for (const ns of [['ns1.cloudflare.com.', 'ns2.cloudflare.com.'], ['ns3.verris.pl.', 'ns4.verris.pl.']]) {
      const t = strefa(ns.map((value) => ({ name: 'pb55.d3.hvln.pl.', type: 'NS', value })));
      await expect(t.svc.przepiszNsWStrefachKonta('s1', 'u1', 'ns3.verris.pl', 'ns4.verris.pl')).resolves.toBe(0);
      expect(t.dodaj).not.toHaveBeenCalled();
      expect(t.usun).not.toHaveBeenCalled();
    }
  });

  it('DA nie zapisał nowych NS → błąd, stare zostają (strefa nigdy bez NS)', async () => {
    const t = strefa([{ name: 'pb55.d3.hvln.pl.', type: 'NS', value: 'ns1.t2.verris.pl.' }], { nieZapisuj: true });
    await expect(t.svc.przepiszNsWStrefachKonta('s1', 'u1', 'ns3.verris.pl', 'ns4.verris.pl')).rejects.toThrow('stare zostawione');
    expect(t.usun).not.toHaveBeenCalled();
    expect(t.ns()).toEqual(['ns1.t2.verris.pl.']);
  });

  it('błąd listy domen konta → wyjątek (konto liczone jako błąd), nie „0 zmian”', async () => {
    const t = strefa([]);
    vi.spyOn(t.svc, 'listHostingDomainsForSubscription').mockResolvedValue({ domains: [], primaryDomain: null, daUsername: null, fetchError: 'Serwer chwilowo niedostępny' });
    await expect(t.svc.przepiszNsWStrefachKonta('s1', 'u1', 'ns3.verris.pl', 'ns4.verris.pl')).rejects.toThrow('Domeny konta');
  });

  it('applyBrandedNameserversOnNode przepisuje strefy także, gdy NS konta były już ustawione', async () => {
    const { svc } = serwis(WEZEL, { account: { findMany: vi.fn(async () => [{ daUsername: 'juz', subscriptionId: 's1', userId: 'u1' }]) } });
    const c = klient();
    Object.assign(c, { client: { get: vi.fn(async () => ({ data: { ns1: 'ns3.verris.pl', ns2: 'ns4.verris.pl' } })), post: vi.fn() } });
    vi.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    vi.spyOn(c, 'setResellerDefaultNameservers').mockResolvedValue(undefined);
    vi.spyOn(c, 'setUserNameservers').mockRejectedValue(new Error('Nameservers already set'));
    const strefy = vi.spyOn(svc, 'przepiszNsWStrefachKonta').mockResolvedValue(1);
    const wynik = await svc.applyBrandedNameserversOnNode('n1', 'ns3.verris.pl', 'ns4.verris.pl');
    expect(strefy).toHaveBeenCalledWith('s1', 'u1', 'ns3.verris.pl', 'ns4.verris.pl');
    expect(wynik.hostingAccounts).toEqual({ updated: 1, skipped: 0, failed: 0 });
  });
});
