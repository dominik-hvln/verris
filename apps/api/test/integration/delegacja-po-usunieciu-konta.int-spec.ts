import { DirectAdminService } from '../../src/servers/directadmin.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * z18b (t1, 08.10): usunięcie CAŁEGO konta, którego domena jest poddomeną domeny innego konta, zostawiało NS/DS
 * w strefie tamtego konta. Tu: zapytanie o konto-rodzica na prawdziwym PostgreSQL — ten sam węzeł, konto żywe,
 * najbliższy przodek; samo zdejmowanie rekordów jest w directadmin.domeny.spec.ts.
 */
describe('Delegacja po usunięciu konta — konto-rodzic na węźle', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  const serwis = () => {
    const svc = new DirectAdminService(prisma() as never, {} as never, {} as never, { record: async () => undefined } as never);
    const sprzatanie = vi
      .spyOn(svc as unknown as { usunDelegacjeWStrefieRodzica: (...a: unknown[]) => Promise<void> }, 'usunDelegacjeWStrefieRodzica')
      .mockResolvedValue(undefined);
    return { svc, sprzatanie };
  };

  it('najbliższy żywy przodek na tym samym węźle; usunięte konto i inny węzeł się nie liczą', async () => {
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const w1 = await utworzWezel();
    const w2 = await utworzWezel();
    const ustawDomene = async (k: { account: { id: string } }, domain: string) =>
      prisma().account.update({ where: { id: k.account.id }, data: { domain } });
    const dziadek = await utworzKonto({ serverId: w1.id, planId: plan.id });
    await ustawDomene(dziadek, 'firma.test');
    const rodzic = await utworzKonto({ serverId: w1.id, planId: plan.id });
    await ustawDomene(rodzic, 'dzial.firma.test');
    const usunietyRodzic = await utworzKonto({ serverId: w1.id, planId: plan.id, status: 'DELETED' });
    await ustawDomene(usunietyRodzic, 'stary.firma.test');
    const naInnymWezle = await utworzKonto({ serverId: w2.id, planId: plan.id });
    await ustawDomene(naInnymWezle, 'inny.test');
    const usuwane = await utworzKonto({ serverId: w1.id, planId: plan.id });

    const { svc, sprzatanie } = serwis();
    await svc.usunDelegacjeUsunietegoKonta(w1.id, usuwane.account.id, ['sklep.dzial.firma.test', 'x.stary.firma.test', 'y.inny.test']);

    expect(sprzatanie.mock.calls.map((c) => [c[0], c[1], c[2], c[3]])).toEqual([
      [rodzic.subscription.id, rodzic.user.id, 'sklep.dzial.firma.test', ['dzial.firma.test']],
      // stary.firma.test usunięte → najbliższy żywy przodek to firma.test
      [dziadek.subscription.id, dziadek.user.id, 'x.stary.firma.test', ['firma.test']],
    ]);
  });
});
