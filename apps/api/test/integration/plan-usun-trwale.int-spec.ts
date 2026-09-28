import { ConflictException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { PlansService } from '../../src/plans/plans.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/** 28.09 — plan usuwa się na stałe tylko, gdy nikt go nigdy nie kupił; inaczej tylko wyłączenie. */
const plany = () => {
  const p = prisma() as never;
  return new PlansService(p, new AuditService(p), null as never, null as never);
};

describe('Plan — trwałe usunięcie', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('nieużywany plan znika', async () => {
    const plan = await utworzPlan();
    await plany().usunTrwale(plan.id, 'admin');
    expect(await prisma().plan.findUnique({ where: { id: plan.id } })).toBeNull();
  });

  it('plan z subskrypcją (także zakończoną) — odmowa, plan zostaje', async () => {
    const plan = await utworzPlan();
    const wezel = await utworzWezel();
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'CANCELED' } as never });
    await expect(plany().usunTrwale(plan.id, 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma().plan.findUnique({ where: { id: plan.id } })).not.toBeNull();
  });
});
