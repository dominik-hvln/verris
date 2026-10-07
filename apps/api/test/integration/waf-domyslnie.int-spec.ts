import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Decyzja 07.10: nowe konto ma WAF w trybie blokowania. Tryb bez zastosowanego zadania = brak bloku
 * w .htaccess = konfiguracja serwera (SecRuleEngine On), więc baza musi mówić „ON”, a nie „Detekcja”.
 */
describe('WAF — domyślnie blokowanie', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('nowe konto dostaje wafMode ON', async () => {
    const w = await utworzWezel({ name: 't1' });
    const plan = await utworzPlan();
    const { account } = await utworzKonto({ serverId: w.id, planId: plan.id });
    expect((await prisma().account.findUniqueOrThrow({ where: { id: account.id } })).wafMode).toBe('ON');
  });
});
