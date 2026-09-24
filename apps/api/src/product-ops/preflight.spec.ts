import { ProductOpsAdminController, PROVISIONING_DO_NAPRAWY } from './product-ops.admin.controller';

/**
 * PROD-03 — preflight GO-LIVE blokuje start tylko na tym, co trzeba naprawić.
 * Nieudane zakładanie usługi, która potem została anulowana (zwrot wypłacony), to
 * historia — wcześniej cztery testowe zamówienia z maja–lipca blokowały start na zawsze.
 */
describe('PROD-03 — preflight GO-LIVE', () => {
  function kontroler(liczby: { provisioning: number }) {
    const subscriptionCount = jest.fn(async () => liczby.provisioning);
    const prisma = {
      subscription: { count: subscriptionCount },
      migrationRequest: { count: jest.fn(async () => 0) },
      probeIncident: { count: jest.fn(async () => 0) },
      server: { count: jest.fn(async () => 1) },
      featureFlag: { count: jest.fn(async () => 0) },
      maintenanceWindow: { count: jest.fn(async () => 0) },
    };
    const c = new ProductOpsAdminController(prisma as never, {} as never, {} as never, {} as never, {} as never);
    return { c, subscriptionCount };
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
});
