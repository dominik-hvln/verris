import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/** 28.09 — usunięte konto blokowało domenę na zawsze („already taken” przy nowej usłudze na t1). */
describe('Domena konta po usunięciu', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('usunięte konto zwalnia domenę; dwa żywe konta na tej samej domenie — nadal zabronione', async () => {
    const w = await utworzWezel();
    const plan = await utworzPlan();
    const stare = await utworzKonto({ serverId: w.id, planId: plan.id, status: 'DELETED' });
    await prisma().account.update({ where: { id: stare.account.id }, data: { domain: 'wraca.pl' } });

    const nowe = await utworzKonto({ serverId: w.id, planId: plan.id });
    await expect(prisma().account.update({ where: { id: nowe.account.id }, data: { domain: 'wraca.pl' } })).resolves.toBeTruthy();

    const trzecie = await utworzKonto({ serverId: w.id, planId: plan.id });
    await expect(prisma().account.update({ where: { id: trzecie.account.id }, data: { domain: 'wraca.pl' } })).rejects.toThrow();
  });
});
