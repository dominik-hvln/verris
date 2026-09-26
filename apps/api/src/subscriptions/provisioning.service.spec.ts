import { ConflictException } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service.js';
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

function stanowisko(o: { kontoZDomena?: boolean; limity?: Error; zapis?: Error; usuniecie?: Error; ip?: string } = {}) {
  const subscription = {
    id: 'sub-1', userId: 'u1', status: 'PROVISIONING', serviceTag: 'abc12345', ecoModeEnabled: false,
    plan: PLAN, user: { email: 'jan@firma.pl' }, account: null,
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
      findUnique: vi.fn(async (q: { where: { domain?: string } }) => (q.where.domain && o.kontoZDomena ? { id: 'inne' } : null)),
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
  const svc = new ProvisioningService(
    prisma as never,
    { encrypt: (v: string) => `enc:${v}` } as never,
    audit as never,
    { pickServerForPlan: vi.fn(async () => ({ id: 'n1', ipAddress: o.ip ?? '0.0.0.0' })) } as never,
    {
      getClientForServer: vi.fn(async () => daClient),
      applyEcoModeBackupCronPolicy: vi.fn(),
      requestLetsEncryptDirect: vi.fn(async () => undefined),
    } as never,
    { resolveNameservers: vi.fn(async () => ({ ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl' })) } as never,
    { send: vi.fn(async () => undefined) } as never,
    { get: () => undefined } as never,
    { safeAward: vi.fn(), awardSubscriptionFirstPaid: vi.fn(), awardOnce: vi.fn() } as never,
    { setModeForAccount: vi.fn(async () => undefined) } as never,
  );
  vi.spyOn(svc as unknown as { notifyAccountProvisioned: () => Promise<void> }, 'notifyAccountProvisioned').mockResolvedValue();
  const akcje = () => (audit.record.mock.calls as unknown as Array<[{ action: string; details: Record<string, unknown> }]>).map((c) => c[0]);
  return { svc, daClient, prisma, akcje };
}

describe('ProvisioningService — zakładanie konta DA', () => {
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
    expect(s.akcje().map((a) => a.action)).toEqual(['PROVISIONING_ROLLBACK']);
  });

  it('nieudane sprzątanie → PROVISIONING_ROLLBACK_FAILED w audycie (ręczne sprzątanie), błąd etapu leci dalej', async () => {
    const s = stanowisko({ zapis: new Error('db down'), usuniecie: new Error('socket hang up') });
    await expect(s.svc.provisionForSubscription('sub-1', { domain: 'firma.pl' })).rejects.toBeInstanceOf(BladEtapuProvisioningu);
    expect(s.akcje()).toContainEqual(expect.objectContaining({
      action: 'PROVISIONING_ROLLBACK_FAILED', details: expect.objectContaining({ stage: 'zapisKonta', error: 'socket hang up', domain: 'firma.pl' }),
    }));
  });
});
