import { ProductOpsAdminController, PROVISIONING_DO_NAPRAWY } from './product-ops.admin.controller';

/**
 * PROD-03 — preflight GO-LIVE blokuje start tylko na tym, co trzeba naprawić.
 * Nieudane zakładanie usługi, która potem została anulowana (zwrot wypłacony), to
 * historia — wcześniej cztery testowe zamówienia z maja–lipca blokowały start na zawsze.
 */
describe('PROD-03 — preflight GO-LIVE', () => {
  function kontroler(liczby: { provisioning: number; sla?: string | null; rejestrator?: string }) {
    const subscriptionCount = jest.fn(async () => liczby.provisioning);
    const prisma = {
      subscription: { count: subscriptionCount },
      migrationRequest: { count: jest.fn(async () => 0) },
      probeIncident: { count: jest.fn(async () => 0) },
      server: { count: jest.fn(async () => 1) },
      featureFlag: { count: jest.fn(async () => 0) },
      maintenanceWindow: { count: jest.fn(async () => 0) },
      platformSetting: { findUnique: jest.fn(async () => (liczby.sla === null ? null : { value: liczby.sla ?? '1' })) },
    };
    const config = { get: jest.fn(() => (liczby.rejestrator === undefined ? 'openprovider' : liczby.rejestrator)) };
    const c = new ProductOpsAdminController(prisma as never, {} as never, {} as never, {} as never, {} as never, config as never);
    return { c, subscriptionCount, prisma };
  }

  it('liczy tylko nieudane zakładanie usług, które nie są anulowane ani wygasłe', async () => {
    const { c, subscriptionCount } = kontroler({ provisioning: 0 });
    await c.preflight();
    expect(subscriptionCount).toHaveBeenCalledWith({ where: PROVISIONING_DO_NAPRAWY });
    expect(PROVISIONING_DO_NAPRAWY.status.notIn).toEqual(expect.arrayContaining(['CANCELED', 'EXPIRED']));
  });

  it('nierozwiązane zakładanie nadal blokuje start', async () => {
    const { c } = kontroler({ provisioning: 2 });
    const r = await c.preflight();
    expect(r.goLiveReady).toBe(false);
    expect(r.blockers).toContain('2 failed provisioning');
  });

  it('bez blokerów → gotowe', async () => {
    const { c } = kontroler({ provisioning: 0 });
    await expect(c.preflight()).resolves.toMatchObject({ goLiveReady: true, blockers: [] });
  });

  it('węzeł liczy się tylko z żywym sygnałem agenta (sam status ACTIVE nie wystarcza)', async () => {
    const { c, prisma } = kontroler({ provisioning: 0 });
    await c.preflight();
    const where = (prisma.server.count.mock.calls[0] as unknown as [{ where: { status: string; lastHeartbeatAt: { gte: Date } } }])[0].where;
    expect(where.status).toBe('ACTIVE');
    expect(Date.now() - where.lastHeartbeatAt.gte.getTime()).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  it('obietnice z verris.pl: wyłączone rekompensaty SLA i brak rejestratora blokują start', async () => {
    const r = await kontroler({ provisioning: 0, sla: null, rejestrator: '' }).c.preflight();
    expect(r.goLiveReady).toBe(false);
    expect(r.blockers.join(' | ')).toMatch(/SLA credits disabled[\s\S]*registrar not configured/);
  });
});

