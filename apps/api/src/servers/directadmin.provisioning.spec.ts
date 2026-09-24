import { DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service';

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
    server: { findUnique: jest.fn(async () => server) },
    account: { findMany: jest.fn(async () => []) },
    plan: { findMany: jest.fn(async () => []) },
    ...extra,
  };
  const crypto = { decrypt: jest.fn((v: string) => `plain:${v}`) };
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
    await expect(serwis({ ...WEZEL, daPasswordEnc: null }).svc.getClientForServer('n1')).rejects.toThrow('not configured');
    await expect(serwis(null).svc.getClientForServer('n1')).rejects.toThrow('Server not found');
  });
});

describe('Test połączenia (zakres klucza)', () => {
  function zKlientem() {
    const { svc } = serwis(WEZEL);
    const c = klient();
    jest.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    const domeny = jest.spyOn(c, 'getDomains').mockResolvedValue(['a.pl', 'b.pl']);
    const pakiety = jest.spyOn(c, 'listUserPackages').mockResolvedValue(['starter', 'pro']);
    const konta = jest.spyOn(c, 'listAccounts').mockResolvedValue(['u1']);
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
    expect(await svc.testConnection('n1')).toMatchObject({ ok: false, error: expect.stringContaining('not configured') });
  });
});

describe('Synchronizacja pakietów DA z planami', () => {
  const plan = (slug: string) => ({
    slug, diskLimitMb: 10240, includedTransferGb: 100, cpuLimit: 100, ramLimitMb: 1024, ioLimitKbps: 10240,
    iopsLimit: 1024, entryProcesses: 20, nprocLimit: 100, sshAccess: false, productKind: 'HOSTING',
  });

  it('upsert dla każdego aktywnego planu w kolejności; tylko aktywne plany', async () => {
    const plans = { findMany: jest.fn(async () => [plan('starter'), plan('pro')]) };
    const { svc } = serwis(WEZEL, { plan: plans });
    const c = klient();
    jest.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    const upsert = jest.spyOn(c, 'upsertUserPackage').mockResolvedValue(undefined);
    expect(await svc.syncPlanPackagesForServer('n1')).toEqual({ synced: ['starter', 'pro'] });
    expect(plans.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(upsert.mock.calls.map(([spec]) => spec.name)).toEqual(['starter', 'pro']);
  });

  it('błąd DA na pierwszym pakiecie → wyjątek, kolejne nie są wysyłane', async () => {
    const { svc } = serwis(WEZEL, { plan: { findMany: jest.fn(async () => [plan('starter'), plan('pro')]) } });
    const c = klient();
    jest.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    const upsert = jest.spyOn(c, 'upsertUserPackage').mockRejectedValue(new Error('DirectAdmin API Error: invalid quota'));
    await expect(svc.syncPlanPackagesForServer('n1')).rejects.toThrow('invalid quota');
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('Markowe NS na węźle', () => {
  function ns(obecne: { ns1: string; ns2: string }, konta: string[]) {
    const { svc } = serwis(WEZEL, { account: { findMany: jest.fn(async () => konta.map((daUsername) => ({ daUsername }))) } });
    const c = klient();
    Object.assign(c, { client: { get: jest.fn(async () => ({ data: obecne })), post: jest.fn() } });
    jest.spyOn(svc, 'getClientForServer').mockResolvedValue(c);
    const admin = jest.spyOn(c, 'setAdminDefaultNameservers').mockResolvedValue(undefined);
    const reseller = jest.spyOn(c, 'setResellerDefaultNameservers').mockResolvedValue(undefined);
    const user = jest.spyOn(c, 'setUserNameservers').mockImplementation(async (u: string) => {
      if (u === 'juz') throw new Error('Nameservers already set');
      if (u === 'zly') throw new Error('User is suspended');
    });
    return { svc, admin, reseller, user };
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
