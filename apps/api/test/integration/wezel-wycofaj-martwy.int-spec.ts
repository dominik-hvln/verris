import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { ServersService } from '../../src/servers/servers.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/** 28.09 — Node-PL-01: serwer skasowany u dostawcy, a w panelu węzeł „aktywny” z 3 kontami i NS na jego IP. */
const dns = { zwolnione: 0, zwolnijNazwyWezla: async () => { dns.zwolnione += 1; return []; } };
const serwery = () => {
  const p = prisma() as never;
  return new ServersService(p, null as never, new AuditService(p), null as never, null as never, null as never, null as never, dns as never, null as never);
};
const MIESIAC_TEMU = new Date(Date.now() - 30 * 24 * 3600_000);

describe('Wycofanie martwego węzła', () => {
  beforeEach(async () => { await wyczyscBaze(); dns.zwolnione = 0; });
  afterAll(rozlacz);

  it('konta usunięte z księgi, subskrypcje anulowane, węzeł poza pulą, NS zwolnione', async () => {
    const w = await utworzWezel({ name: 'Node-PL-01', lastHeartbeatAt: MIESIAC_TEMU });
    const plan = await utworzPlan();
    const k = await utworzKonto({ serverId: w.id, planId: plan.id, ksiegujNaWezle: true });
    const przed = await prisma().server.findUniqueOrThrow({ where: { id: w.id } });
    await serwery().wycofajMartwyWezel(w.id, 'Node-PL-01', 'admin');
    expect((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).status).toBe('DELETED');
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } })).status).toBe('CANCELED');
    const po = await prisma().server.findUniqueOrThrow({ where: { id: w.id } });
    expect(po.status).toBe('DEPROVISIONING');
    expect(po.acceptsNewAccounts).toBe(false);
    expect(po.allocatedCpu).toBe(przed.allocatedCpu - k.account.cpuLimit);
    expect(dns.zwolnione).toBe(1);
  });

  it('żywy węzeł, zła nazwa albo aktywna płatność Stripe — odmowa bez zmian', async () => {
    const zywy = await utworzWezel({ name: 'zywy' });
    await expect(serwery().wycofajMartwyWezel(zywy.id, 'zywy', 'admin')).rejects.toBeInstanceOf(ConflictException);

    const martwy = await utworzWezel({ name: 'martwy', lastHeartbeatAt: MIESIAC_TEMU });
    await expect(serwery().wycofajMartwyWezel(martwy.id, 'inna', 'admin')).rejects.toBeInstanceOf(BadRequestException);

    const plan = await utworzPlan();
    const k = await utworzKonto({ serverId: martwy.id, planId: plan.id });
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'ACTIVE', stripeSubscriptionId: 'sub_test_1' } });
    await expect(serwery().wycofajMartwyWezel(martwy.id, 'martwy', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).status).toBe('ACTIVE');
    expect((await prisma().server.findUniqueOrThrow({ where: { id: martwy.id } })).status).not.toBe('DEPROVISIONING');
    expect(dns.zwolnione).toBe(0);
  });
});
