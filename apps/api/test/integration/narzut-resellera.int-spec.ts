import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PartnersService } from '../../src/partners/partners.service.js';
import { PartnerCommissionScheduler } from '../../src/partners/partner-commission.scheduler.js';
import { ResellerKlienciService } from '../../src/reseller/reseller-klienci.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * O-07 — narzut resellera na prawdziwej bazie: opłata klienta z narzutem → prowizja resellera
 * (także przy wyłączonym programie poleceń) → wypłata do portfela bez zapisu do programu →
 * odpięcie klienta przywraca cennik.
 */
const ustawienia = { getPartnerProgram: async () => ({ enabled: false, commissionPct: 0, holdDays: 0, minPayout: 50, freeHostingThreshold: 0, freeHostingCredit: 0 }) };

describe('O-07 narzut resellera', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('prowizja z opłaty, wypłata przez resellera, powrót do cennika po odpięciu', async () => {
    const p = prisma();
    const t = Date.now();
    const reseller = await p.user.create({ data: { email: `rsl-${t}@test.verris.pl`, passwordHash: 'x' } });
    await p.resellerProfile.create({ data: { userId: reseller.id, status: 'ACTIVE', markupPct: 20, code: `rsl_${t}` } });
    const klient = await p.user.create({ data: { email: `kl-${t}@test.verris.pl`, passwordHash: 'x', resellerOwnerId: reseller.id } });
    const plan = await p.plan.create({ data: { slug: `p-${t}`, name: 'P', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 1024, priceMonthly: 45, priceYearly: 399 } });
    const sub = await p.subscription.create({
      data: { userId: klient.id, planId: plan.id, interval: 'MONTH', priceAmount: 54, listPriceAmount: 54, resellerMarkupPct: 20, status: 'ACTIVE', paymentSource: 'WALLET' },
    });
    await p.walletTransaction.create({ data: { userId: klient.id, type: 'CHARGE_SUBSCRIPTION', amount: -54, balanceAfter: 0, subscriptionId: sub.id } });

    const scheduler = new PartnerCommissionScheduler(p as never, ustawienia as never);
    await scheduler.run();
    await scheduler.run(); // drugi przebieg: bez dubla, a prowizja dojrzewa (karencja 0)
    const prowizje = await p.partnerCommission.findMany({ where: { partnerUserId: reseller.id } });
    expect(prowizje).toHaveLength(1);
    expect(prowizje[0]).toMatchObject({ kind: 'RESELLER_MARKUP', status: 'AVAILABLE', pct: 20, referredUserId: klient.id });
    expect(Number(prowizje[0].amount)).toBe(9);

    const partners = new PartnersService(p as never, new AuditService(p as never), new WalletLedgerService(p as never), ustawienia as never);
    expect((await partners.getOverview(reseller.id)).resellerMarkup).toEqual({ pending: 0, available: 9 });
    await expect(partners.requestWalletPayout(reseller.id)).resolves.toMatchObject({ amount: 9 });
    expect(Number((await p.user.findUniqueOrThrow({ where: { id: reseller.id } })).walletBalance)).toBe(9);

    const klienci = new ResellerKlienciService(p as never, new AuditService(p as never), { send: async () => undefined } as never, {} as never, { get: () => 'true' } as never);
    await klienci.odepnijSie(klient.id);
    const po = await p.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(Number(po.priceAmount)).toBe(45);
    expect(Number(po.listPriceAmount)).toBe(45);
    expect(po.resellerMarkupPct).toBeNull();
    expect((await p.user.findUniqueOrThrow({ where: { id: klient.id } })).resellerOwnerId).toBeNull();
    expect(await p.subscriptionEvent.count({ where: { subscriptionId: sub.id, type: 'RESELLER_MARKUP_REMOVED' } })).toBe(1);
  });
});
