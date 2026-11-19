import { promises as dns } from 'node:dns';
import { ConflictException } from '@nestjs/common';
import { emailKontaDa, ProvisioningService } from './provisioning.service.js';
import { BladEtapuProvisioningu } from './provisioning-error.js';

/**
 * X-09 — zakładanie konta DA w ProvisioningService. Pilnujemy kolejności i sprzątania:
 *  - błąd po utworzeniu konta DA (limity LVE, zapis w bazie) usuwa konto z węzła — inaczej domena
 *    zostaje osierocona, ponowienie pada na „domain already exists”, a klient dostaje zwrot,
 *  - przyczyna jedzie w BladEtapuProvisioningu (Z-18), a nie tylko w audycie,
 *  - zajęta domena nie dotyka węzła.
 */
const PLAN = {
  slug: 'start', name: 'Start', productKind: 'HOSTING', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240,
  ioLimitKbps: 1024, iopsLimit: 1024, entryProcesses: 20, nprocLimit: 100,
};

function stanowisko(o: {
  kontoZDomena?: boolean; limity?: Error; zapis?: Error; usuniecie?: Error; ip?: string;
  /** Paczka 129 – atrapa AdresTechnicznyService: adres już na usłudze / nadawany teraz / błąd DNS. */
  adres?: { naUsludze?: string | null; nadaj?: string | null; dnsBlad?: Error; aliasBlad?: Error };
} = {}) {
  const subscription = {
    id: 'sub-1', userId: 'u1', status: 'PROVISIONING', serviceTag: 'abc12345', ecoModeEnabled: false,
    plan: PLAN, user: { email: 'jan@firma.pl' }, account: null, adresTechniczny: o.adres?.naUsludze ?? null,
  };
  const daClient = {
    ensureUserPackage: vi.fn(async () => undefined),
    createAccount: vi.fn(async () => ({ password: 'HasloDA123' })),
    setAccountLimits: vi.fn(async () => (o.limity ? Promise.reject(o.limity) : undefined)),
    deleteAccount: vi.fn(async () => (o.usuniecie ? Promise.reject(o.usuniecie) : undefined)),
  };
  const prisma = {
    subscription: { findUnique: vi.fn(async () => subscription), update: vi.fn(async () => subscription) },
    account: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async (q: { where: { domain?: string } }) => (q.where.domain && o.kontoZDomena ? { id: 'inne' } : null)),
    },
    siteMonitor: { upsert: vi.fn(async () => undefined) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      if (o.zapis) throw o.zapis;
      return fn({
        account: { create: vi.fn(async () => ({ id: 'acc-1' })) },
        subscription: { update: vi.fn(async () => ({ ...subscription, status: 'ACTIVE' })) },
        server: { update: vi.fn(async () => undefined) },
        subscriptionEvent: { create: vi.fn(async () => undefined) },
        backupSchedule: { upsert: vi.fn(async () => undefined) },
      });
    }),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const le = vi.fn(async () => undefined);
  const daSvc = {
    getClientForServer: vi.fn(async () => daClient),
    assertDomenaNieJestCudza: vi.fn(async () => undefined),
    usunDelegacjeUsunietegoKonta: vi.fn(async () => undefined),
    applyEcoModeBackupCronPolicy: vi.fn(),
    requestLetsEncryptDirect: le,
    dodajAliasAdresuTechnicznego: vi.fn(async () => (o.adres?.aliasBlad ? Promise.reject(o.adres.aliasBlad) : { ok: true })),
  };
  const adresSvc = o.adres
    ? {
        nadaj: vi.fn(async () => o.adres!.nadaj ?? null),
        zarezerwowana: (d: string) => d === 'verris-host.pl' || d.endsWith('.verris-host.pl'),
        ustawRekord: vi.fn(async () => (o.adres!.dnsBlad ? Promise.reject(o.adres!.dnsBlad) : 'utworzono')),
      }
    : undefined;
  const svc = new ProvisioningService(
    prisma as never,
    { encrypt: (v: string) => `enc:${v}` } as never,
    audit as never,
    { pickServerForPlan: vi.fn(async () => ({ id: 'n1', ipAddress: o.ip ?? '0.0.0.0' })) } as never,
    daSvc as never,
    { resolveNameservers: vi.fn(async () => ({ ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl' })) } as never,
    { send: vi.fn(async () => undefined) } as never,
    { get: () => undefined } as never,
    { safeAward: vi.fn(), awardSubscriptionFirstPaid: vi.fn(), awardOnce: vi.fn() } as never,
    { setModeForAccount: vi.fn(async () => undefined) } as never,
    adresSvc as never,
  );
  vi.spyOn(svc as unknown as { notifyAccountProvisioned: () => Promise<void> }, 'notifyAccountProvisioned').mockResolvedValue();
  const akcje = () => (audit.record.mock.calls as unknown as Array<[{ action: string; details: Record<string, unknown> }]>).map((c) => c[0]);
  return { svc, daClient, prisma, akcje, le, daSvc, adresSvc };
}

describe('emailKontaDa – DA nie pisze do klientów sam', () => {
  it('węzeł z nazwą hosta → lokalny alias bez doręczenia; bez nazwy → e-mail klienta (profil przestawi)', () => {
    expect(emailKontaDa({ hostname: 'T1.verris.pl ' }, 'jan@firma.pl')).toBe('verris-da-powiadomienia@t1.verris.pl');
    expect(emailKontaDa({ hostname: null }, 'jan@firma.pl')).toBe('jan@firma.pl');
    expect(emailKontaDa({ hostname: 'zly host;rm' }, 'jan@firma.pl')).toBe('jan@firma.pl');
  });
});

describe('ProvisioningService – zakładanie konta DA', () => {
  it('pakiet → konto (login = handle usługi, IP „shared” dla 0.0.0.0, NS platformy) → limity → zapis', async () => {
    const s = stanowisko();
    const r = await s.svc.provisionForSubscription('sub-1', { domain: ' Firma.PL ' });
    expect(s.daClient.createAccount).toHaveBeenCalledWith(expect.objectContaining({
      username: 'abc12345', email: 'jan@firma.pl', domain: 'firma.pl', packageName: 'start', ip: 'shared', ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl',
    }));
    expect(s.daClient.setAccountLimits).toHaveBeenCalledWith('abc12345', expect.objectContaining({ memoryMb: 1024, diskQuotaMb: 10240 }));
    expect(r).toMatchObject({ accountId: 'acc-1', daUsername: 'abc12345', domain: 'firma.pl' });
    expect(s.daClient.deleteAccount).not.toHaveBeenCalled();
  });

  it('zajęta domena → 409 bez dotykania węzła', async () => {
    const s = stanowisko({ kontoZDomena: true });
    await expect(s.svc.provisionForSubscription('sub-1', { domain: 'firma.pl' })).rejects.toThrow(ConflictException);
    expect(s.daClient.createAccount).not.toHaveBeenCalled();
  });

  it('błąd limitów LVE → konto DA usunięte, przyczyna w błędzie etapu', async () => {
    const s = stanowisko({ limity: new Error('lvectl: connect ETIMEDOUT') });
    const e = await s.svc.provisionForSubscription('sub-1', { domain: 'firma.pl' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BladEtapuProvisioningu);
    expect(e).toMatchObject({ etap: 'setAccountLimits', przyczyna: 'lvectl: connect ETIMEDOUT' });
    expect(s.daClient.deleteAccount).toHaveBeenCalledWith('abc12345');
    expect(s.akcje()).toContainEqual(expect.objectContaining({ action: 'PROVISIONING_ROLLBACK', details: expect.objectContaining({ stage: 'setAccountLimits' }) }));
  });

  it('błąd zapisu w bazie po założeniu konta → konto DA usunięte (nie zostaje sierota na węźle)', async () => {
    const s = stanowisko({ zapis: new Error('Unique constraint failed on the fields: (`domain`)') });
    const e = await s.svc.provisionForSubscription('sub-1', { domain: 'firma.pl' }).catch((x: unknown) => x);
    expect(e).toMatchObject({ etap: 'zapisKonta', przyczyna: expect.stringContaining('Unique constraint') });
    expect(s.daClient.deleteAccount).toHaveBeenCalledWith('abc12345');
    expect(s.akcje().map((a) => a.action)).toEqual(['PROVISIONING_ROLLBACK']);    // z18b (08.10): domena-poddomena innego konta nie zostawia NS/DS w jego strefie po wycofaniu
    expect(s.daSvc.usunDelegacjeUsunietegoKonta).toHaveBeenCalledWith('n1', '', ['firma.pl']);
  });

  it('nieudane sprzątanie → PROVISIONING_ROLLBACK_FAILED w audycie (ręczne sprzątanie), błąd etapu leci dalej', async () => {
    const s = stanowisko({ zapis: new Error('db down'), usuniecie: new Error('socket hang up') });
    await expect(s.svc.provisionForSubscription('sub-1', { domain: 'firma.pl' })).rejects.toBeInstanceOf(BladEtapuProvisioningu);
    expect(s.akcje()).toContainEqual(expect.objectContaining({
      action: 'PROVISIONING_ROLLBACK_FAILED', details: expect.objectContaining({ stage: 'zapisKonta', error: 'socket hang up', domain: 'firma.pl' }),
    }));
  });

  it('auto-SSL tylko gdy domena już wskazuje na węzeł (inaczej DA wysyła klientowi błąd ACME)', async () => {
    const r4 = vi.spyOn(dns, 'resolve4');
    r4.mockResolvedValueOnce(['9.9.9.9']);
    const nie = stanowisko({ ip: '2.28.204.249' });
    await nie.svc.provisionForSubscription('sub-1', { domain: 'firma.pl' });
    await new Promise((r) => setTimeout(r, 0));
    expect(nie.le).not.toHaveBeenCalled();
    r4.mockResolvedValueOnce(['2.28.204.249']);
    const tak = stanowisko({ ip: '2.28.204.249' });
    await tak.svc.provisionForSubscription('sub-1', { domain: 'firma.pl' });
    await new Promise((r) => setTimeout(r, 0));
    expect(tak.le).toHaveBeenCalled();
    r4.mockRestore();
  });
});

describe('ProvisioningService – adres techniczny (paczka 129)', () => {
  const ADRES = 'v7k2m9qx.verris-host.pl';

  it('zamówienie bez domeny: konto DA na adresie technicznym, bez kontroli „cudzej domeny”, rekord A → IP węzła', async () => {
    const s = stanowisko({ ip: '203.0.113.7', adres: { naUsludze: ADRES } });
    const r = await s.svc.provisionForSubscription('sub-1', { domain: ADRES });
    expect(s.daClient.createAccount).toHaveBeenCalledWith(expect.objectContaining({ domain: ADRES }));
    expect(s.daSvc.assertDomenaNieJestCudza).not.toHaveBeenCalled();
    expect(s.adresSvc!.ustawRekord).toHaveBeenCalledWith(ADRES, '203.0.113.7');
    // Domena główna = adres techniczny → bez aliasu.
    expect(s.daSvc.dodajAliasAdresuTechnicznego).not.toHaveBeenCalled();
    expect(r.domain).toBe(ADRES);
    expect(s.akcje()).toContainEqual(expect.objectContaining({ action: 'ADRES_TECHNICZNY_PODLACZONY', details: expect.objectContaining({ dns: 'utworzono' }) }));
  });

  it('auto-SSL dla adresu technicznego bez „www.” (w DNS jest tylko rekord A tej nazwy)', async () => {
    const r4 = vi.spyOn(dns, 'resolve4').mockResolvedValueOnce(['203.0.113.7']);
    const s = stanowisko({ ip: '203.0.113.7', adres: { naUsludze: ADRES } });
    await s.svc.provisionForSubscription('sub-1', { domain: ADRES });
    await new Promise((r) => setTimeout(r, 0));
    expect(s.le).toHaveBeenCalledWith(expect.anything(), 'abc12345', 'HasloDA123', ADRES, { includeWww: false });
    r4.mockRestore();
  });

  it('własna domena: adres techniczny nadany przy zakładaniu i podpięty jako alias + rekord A', async () => {
    const s = stanowisko({ ip: '203.0.113.7', adres: { nadaj: ADRES } });
    await s.svc.provisionForSubscription('sub-1', { domain: 'firma.pl' });
    expect(s.adresSvc!.nadaj).toHaveBeenCalledWith('sub-1');
    expect(s.daClient.createAccount).toHaveBeenCalledWith(expect.objectContaining({ domain: 'firma.pl' }));
    expect(s.daSvc.assertDomenaNieJestCudza).toHaveBeenCalledWith('firma.pl', 'u1', { glowna: true });
    expect(s.daSvc.dodajAliasAdresuTechnicznego).toHaveBeenCalledWith('sub-1', 'u1', 'firma.pl', ADRES);
    expect(s.adresSvc!.ustawRekord).toHaveBeenCalledWith(ADRES, '203.0.113.7');
  });

  it('błąd DNS po założeniu konta nie cofa opłaconego konta – ADRES_TECHNICZNY_BLAD w audycie', async () => {
    const s = stanowisko({ ip: '203.0.113.7', adres: { naUsludze: ADRES, dnsBlad: new Error('OVH 403: not been granted') } });
    const r = await s.svc.provisionForSubscription('sub-1', { domain: ADRES });
    expect(r.accountId).toBe('acc-1');
    expect(s.daClient.deleteAccount).not.toHaveBeenCalled();
    expect(s.akcje()).toContainEqual(expect.objectContaining({ action: 'ADRES_TECHNICZNY_BLAD', details: expect.objectContaining({ dnsBlad: 'OVH 403: not been granted' }) }));
  });

  it('cudzy adres w domenie technicznej jako domena konta → 400 bez dotykania węzła', async () => {
    const s = stanowisko({ adres: { naUsludze: ADRES } });
    await expect(s.svc.provisionForSubscription('sub-1', { domain: 'vinnyyyy.verris-host.pl' })).rejects.toThrow(/zarezerwowany/);
    await expect(s.svc.sprawdzDomeneGlowna('verris-host.pl', 'u1')).rejects.toThrow(/zarezerwowany/);
    expect(s.daClient.createAccount).not.toHaveBeenCalled();
  });

  it('bez konfiguracji domeny technicznej – jak dotąd (bez adresu, aliasu i DNS)', async () => {
    const s = stanowisko({ ip: '203.0.113.7' });
    await s.svc.provisionForSubscription('sub-1', { domain: 'firma.pl' });
    expect(s.daSvc.dodajAliasAdresuTechnicznego).not.toHaveBeenCalled();
    expect(s.akcje().map((a) => a.action)).not.toContain('ADRES_TECHNICZNY_PODLACZONY');
  });
});
