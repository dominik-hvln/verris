import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { DirectAdminService } from '../../src/servers/directadmin.service.js';
import { ProvisioningService } from '../../src/subscriptions/provisioning.service.js';
import { NodeSelectorService } from '../../src/subscriptions/node-selector.service.js';
import { prisma, rozlacz, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * X-04 — zakładanie usługi od opłaconej subskrypcji do konta na węźle, na prawdziwej bazie:
 * wybór węzła, konto w DirectAdmin (atrapa), zapis konta, księga węzła, kopie i monitoring.
 * Awaria na każdym etapie po utworzeniu konta w DA musi je wycofać — inaczej domena zostaje
 * osierocona na węźle, a klient dostaje zwrot za hosting, który po cichu działa.
 */

type Awaria = null | 'pakiet' | 'konto' | 'limity';
let awaria: Awaria = null;
const da: string[] = [];

function usluga() {
  const p = prisma() as never;
  const klient = {
    ensureUserPackage: async () => { if (awaria === 'pakiet') throw new Error('ECONNREFUSED'); },
    createAccount: async (a: { username: string; domain: string }) => {
      if (awaria === 'konto') throw new Error('domain already exists');
      da.push(`create:${a.username}:${a.domain}`);
      return { password: 'Haslo-123' };
    },
    setAccountLimits: async () => { if (awaria === 'limity') throw new Error('LVE niedostępne'); },
    deleteAccount: async (u: string) => void da.push(`delete:${u}`),
  };
  const noop = { send: async () => ({}), get: () => undefined, safeAward: () => undefined, awardOnce: async () => undefined, setModeForAccount: async () => undefined };
  return new ProvisioningService(
    p, { encrypt: (v: string) => `enc:${v}` } as never, new AuditService(p), new NodeSelectorService(p),
    {
      getClientForServer: async () => klient, requestLetsEncryptDirect: async () => undefined, usunDelegacjeUsunietegoKonta: async () => undefined,
      // Prawdziwa kontrola Z-10 (czyta tylko bazę).
      assertDomenaNieJestCudza: (d: string, u: string, o?: { glowna?: boolean }) => DirectAdminService.prototype.assertDomenaNieJestCudza.call({ prisma: p }, d, u, o),
    } as never, { resolveNameservers: async () => ({ ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl' }) } as never,
    noop as never, noop as never, noop as never, noop as never,
  );
}

let n = 0;
async function oplacona() {
  n += 1;
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const user = await prisma().user.create({ data: { email: `zakl-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
  const sub = await prisma().subscription.create({
    data: { userId: user.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: SubscriptionStatus.PROVISIONING, serviceTag: `vr${n}x` },
  });
  return { wezel, plan, user, sub };
}
const wezelPo = (id: string) => prisma().server.findUniqueOrThrow({ where: { id } });

describe('X-04 zakładanie usługi', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    awaria = null;
    da.length = 0;
  });
  afterAll(rozlacz);

  it('opłacona subskrypcja: konto w DA i w bazie, usługa aktywna, księga węzła, kopie i monitoring włączone', async () => {
    const { wezel, plan, sub } = await oplacona();
    await usluga().provisionForSubscription(sub.id, { domain: 'Sklep-Klienta.PL' });

    const konto = await prisma().account.findUniqueOrThrow({ where: { subscriptionId: sub.id } });
    expect(konto).toMatchObject({ domain: 'sklep-klienta.pl', serverId: wezel.id, daPasswordEnc: 'enc:Haslo-123' });
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe(SubscriptionStatus.ACTIVE);
    const w = await wezelPo(wezel.id);
    expect(w.allocatedCpu).toBe(plan.cpuLimit);
    expect(w.allocatedMemory).toBe(plan.ramLimitMb);
    expect(await prisma().backupSchedule.count({ where: { subscriptionId: sub.id, enabled: true } })).toBe(1);
    expect(await prisma().siteMonitor.count({ where: { subscriptionId: sub.id, enabled: true } })).toBe(1);
    expect(da).toEqual([`create:${konto.daUsername}:sklep-klienta.pl`]);
  });

  it('limity LVE nie wchodzą: konto w DA wycofane, w bazie nic, księga węzła bez zmian', async () => {
    const { wezel, sub } = await oplacona();
    awaria = 'limity';
    await expect(usluga().provisionForSubscription(sub.id, { domain: 'limity.pl' })).rejects.toThrow();
    expect(da.filter((x) => x.startsWith('delete:'))).toHaveLength(1);
    expect(await prisma().account.count()).toBe(0);
    expect((await wezelPo(wezel.id)).allocatedCpu).toBe(0);
  });

  it('domena zajęta na platformie: odmowa, zanim cokolwiek powstanie w DA', async () => {
    const pierwsza = await oplacona();
    await usluga().provisionForSubscription(pierwsza.sub.id, { domain: 'zajeta.pl' });
    const druga = await oplacona();
    da.length = 0;
    await expect(usluga().provisionForSubscription(druga.sub.id, { domain: 'ZAJETA.pl' })).rejects.toThrow('ma już konto hostingowe');
    expect(da).toEqual([]);
  });

  it('Z-10: subdomena domeny innego klienta albo jego domena z rejestracji → odmowa przed DA (audyt 13.10, #8)', async () => {
    const a = await oplacona();
    await usluga().provisionForSubscription(a.sub.id, { domain: 'a-test.pl' });
    const b = await oplacona();
    await prisma().domain.create({ data: { userId: a.user.id, name: 'rejestr-a.pl', status: 'ACTIVE' } as never });
    da.length = 0;
    await expect(usluga().provisionForSubscription(b.sub.id, { domain: 'sklep.a-test.pl' })).rejects.toThrow('innym koncie');
    await expect(usluga().provisionForSubscription(b.sub.id, { domain: 'rejestr-a.pl' })).rejects.toThrow('innym koncie');
    expect(da).toEqual([]);
    expect(await prisma().account.count({ where: { userId: b.user.id } })).toBe(0);
  });

  it('Z-10: subdomena WŁASNEJ domeny na osobnym koncie → wolno', async () => {
    const a = await oplacona();
    await usluga().provisionForSubscription(a.sub.id, { domain: 'moja.pl' });
    const druga = await prisma().subscription.create({
      data: { userId: a.user.id, planId: a.plan.id, interval: 'MONTH', priceAmount: 45, status: SubscriptionStatus.PROVISIONING, serviceTag: 'vrwlasn' },
    });
    await usluga().provisionForSubscription(druga.id, { domain: 'sklep.moja.pl' });
    expect(await prisma().account.count({ where: { userId: a.user.id } })).toBe(2);
  });

  it('dwa zakładania na tę samą domenę naraz: jedno konto; przegrane wycofane z DA', async () => {
    const a = await oplacona();
    const b = await oplacona();
    const s = usluga();
    const wyniki = await Promise.allSettled([
      s.provisionForSubscription(a.sub.id, { domain: 'wyscig.pl' }),
      s.provisionForSubscription(b.sub.id, { domain: 'wyscig.pl' }),
    ]);
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma().account.count({ where: { domain: 'wyscig.pl' } })).toBe(1);
    const utworzone = da.filter((x) => x.startsWith('create:')).length;
    const wycofane = da.filter((x) => x.startsWith('delete:')).length;
    expect(utworzone - wycofane).toBe(1);
  });

  it('usługa już aktywna z kontem: ponowne zakładanie odrzucone bez drugiego konta', async () => {
    const { sub } = await oplacona();
    await usluga().provisionForSubscription(sub.id, { domain: 'raz.pl' });
    await expect(usluga().provisionForSubscription(sub.id, { domain: 'dwa.pl' })).rejects.toThrow('already has');
    expect(da.filter((x) => x.startsWith('create:'))).toHaveLength(1);
  });
});
