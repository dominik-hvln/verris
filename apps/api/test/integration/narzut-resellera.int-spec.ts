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
    await p.walletTransaction.create({ data: { userId: klient.id, type: 'TOPUP', amount: 54, balanceAfter: 54 } });
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

  // Na t1 07.10: poczta kupiona bez wolnego węzła → automatyczny zwrot; prowizja od zwróconej opłaty zostawała.
  it('przegląd 15.10: reseller bez statusu partnera (program wyłączony / zapis odrzucony) wypłaca tylko narzut', async () => {
    const p = prisma();
    const t = Date.now();
    const reseller = await p.user.create({ data: { email: `rsl2-${t}@test.verris.pl`, passwordHash: 'x' } });
    await p.resellerProfile.create({ data: { userId: reseller.id, status: 'ACTIVE', markupPct: 20, code: `rsl2_${t}` } });
    await p.referralProgramEnrollment.create({ data: { userId: reseller.id, status: 'REJECTED' } } as never);
    const wspolne = { partnerUserId: reseller.id, currency: 'PLN', status: 'AVAILABLE', availableAt: new Date() };
    await p.partnerCommission.create({ data: { ...wspolne, kind: 'RESELLER_MARKUP', dedupeKey: `rsl:x-${t}`, amount: 9, description: 'narzut' } as never });
    await p.partnerCommission.create({ data: { ...wspolne, kind: 'RECURRING_PCT', dedupeKey: `tx:y-${t}`, amount: 15, description: 'polecenie' } as never });
    const partners = new PartnersService(p as never, new AuditService(p as never), new WalletLedgerService(p as never), ustawienia as never);
    await expect(partners.requestWalletPayout(reseller.id)).resolves.toMatchObject({ amount: 9 });
    const polecenie = await p.partnerCommission.findFirstOrThrow({ where: { partnerUserId: reseller.id, kind: 'RECURRING_PCT' } });
    expect(polecenie).toMatchObject({ status: 'AVAILABLE', payoutId: null });
  });

  it('zwrot opłaty: przed naliczeniem bez prowizji, w karencji anuluje, częściowy zmniejsza', async () => {
    const p = prisma();
    const t = Date.now();
    const karencja = { getPartnerProgram: async () => ({ enabled: true, commissionPct: 10, holdDays: 30, minPayout: 50, freeHostingThreshold: 0, freeHostingCredit: 0 }) };
    const reseller = await p.user.create({ data: { email: `rsl-z-${t}@test.verris.pl`, passwordHash: 'x' } });
    await p.resellerProfile.create({ data: { userId: reseller.id, status: 'ACTIVE', markupPct: 25, code: `rslz_${t}` } });
    const plan = await p.plan.create({ data: { slug: `pz-${t}`, name: 'P', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 1024, priceMonthly: 9.99, priceYearly: 99.99 } });
    const scheduler = new PartnerCommissionScheduler(p as never, karencja as never);
    const zakup = async (n: number, kwota: number) => {
      const klient = await p.user.create({ data: { email: `kl-z${n}-${t}@test.verris.pl`, passwordHash: 'x', resellerOwnerId: reseller.id } });
      const sub = await p.subscription.create({
        data: { userId: klient.id, planId: plan.id, interval: 'MONTH', priceAmount: kwota, listPriceAmount: kwota, resellerMarkupPct: 25, status: 'ACTIVE', paymentSource: 'WALLET' },
      });
      // Gotówka klienta (doładowanie) — narzut liczy się od opłat nią pokrytych (decyzja 15.10 #17).
      await p.walletTransaction.create({ data: { userId: klient.id, type: 'TOPUP', amount: 100, balanceAfter: 100, createdAt: new Date(Date.now() - 120_000) } });
      await p.walletTransaction.create({ data: { userId: klient.id, type: 'CHARGE_SUBSCRIPTION', amount: -kwota, balanceAfter: 0, subscriptionId: sub.id, createdAt: new Date(Date.now() - 60_000) } });
      return { klient, sub };
    };
    const zwrot = (u: { klient: { id: string }; sub: { id: string } }, kwota: number) =>
      p.walletTransaction.create({ data: { userId: u.klient.id, type: 'REFUND', amount: kwota, balanceAfter: kwota, subscriptionId: u.sub.id } });
    const prowizja = (u: { klient: { id: string } }) => p.partnerCommission.findFirst({ where: { referredUserId: u.klient.id } });

    // 1) zwrot przed przebiegiem — prowizji nie ma wcale
    const a = await zakup(1, 11.24);
    await zwrot(a, 11.24);
    // 2) zwrot w karencji — prowizja anulowana; 3) częściowy zwrot — prowizja od reszty
    const b = await zakup(2, 12.5);
    const c = await zakup(3, 12.5);
    await scheduler.run();
    expect(await prowizja(a)).toBeNull();
    expect(Number((await prowizja(b))!.amount)).toBe(2.5);
    await zwrot(b, 12.5);
    await zwrot(c, 5);
    // nieudane wznowienie: osobna opłata i jej zwrot nie ruszają prowizji od pierwszej opłaty
    const d = await zakup(4, 12.5);
    await scheduler.run();
    await p.walletTransaction.create({ data: { userId: d.klient.id, type: 'CHARGE_SUBSCRIPTION', amount: -12.5, balanceAfter: 0, subscriptionId: d.sub.id } });
    await zwrot(d, 12.5);
    await scheduler.run();

    expect((await prowizja(b))!.status).toBe('CANCELED');
    expect(await prowizja(c)).toMatchObject({ status: 'PENDING' });
    expect(Number((await prowizja(c))!.amount)).toBe(1.5);
    expect(Number((await prowizja(c))!.baseAmount)).toBe(7.5);
    expect(Number((await p.partnerCommission.findFirst({ where: { referredUserId: d.klient.id }, orderBy: { createdAt: 'asc' } }))!.amount)).toBe(2.5);
  });

  // Decyzja 15.10 (#17, wariant prosty): narzut idzie resellerowi przelewem — tylko od opłat pokrytych gotówką klienta,
  // nie od kredytu obsługi; chargeback wpłaty klienta zdejmuje niewypłacony narzut (jak prowizję z poleceń, #2).
  it('narzut tylko od gotówki klienta; cofnięcie wpłaty anuluje niewypłacony narzut', async () => {
    const p = prisma();
    const t = Date.now();
    const reseller = await p.user.create({ data: { email: `rsl-g-${t}@test.verris.pl`, passwordHash: 'x' } });
    await p.resellerProfile.create({ data: { userId: reseller.id, status: 'ACTIVE', markupPct: 20, code: `rslg_${t}` } });
    const plan = await p.plan.create({ data: { slug: `pg-${t}`, name: 'P', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 1024, priceMonthly: 45, priceYearly: 399 } });
    const klient = await p.user.create({ data: { email: `kl-g-${t}@test.verris.pl`, passwordHash: 'x', resellerOwnerId: reseller.id } });
    const sub = await p.subscription.create({
      data: { userId: klient.id, planId: plan.id, interval: 'MONTH', priceAmount: 54, listPriceAmount: 54, resellerMarkupPct: 20, status: 'ACTIVE', paymentSource: 'WALLET' },
    });
    // Kredyt obsługi (bez wpłaty) pokrywa pierwszą opłatę — bez narzutu.
    await p.walletTransaction.create({ data: { userId: klient.id, type: 'ADJUSTMENT', amount: 54, balanceAfter: 54 } });
    await p.walletTransaction.create({ data: { userId: klient.id, type: 'CHARGE_SUBSCRIPTION', amount: -54, balanceAfter: 0, subscriptionId: sub.id, createdAt: new Date(Date.now() - 60_000) } });
    const scheduler = new PartnerCommissionScheduler(p as never, { getPartnerProgram: async () => ({ enabled: false, commissionPct: 0, holdDays: 30, minPayout: 50, freeHostingThreshold: 0, freeHostingCredit: 0 }) } as never);
    await scheduler.run();
    expect(await p.partnerCommission.count({ where: { referredUserId: klient.id } })).toBe(0);

    // Wpłata gotówki i druga opłata — narzut 9 zł w karencji.
    const wplata = await p.walletTransaction.create({ data: { userId: klient.id, type: 'TOPUP', amount: 54, balanceAfter: 54, metadata: { wplata: { kwota: '54.00' } } } });
    await p.walletTransaction.create({ data: { userId: klient.id, type: 'CHARGE_SUBSCRIPTION', amount: -54, balanceAfter: 0, subscriptionId: sub.id } });
    await scheduler.run();
    const narzut = await p.partnerCommission.findFirstOrThrow({ where: { referredUserId: klient.id } });
    expect([narzut.kind, narzut.status, Number(narzut.amount)]).toEqual(['RESELLER_MARKUP', 'PENDING', 9]);

    // Chargeback tej wpłaty przy pustym portfelu: znacznik na wpłacie i narzut anulowany.
    await p.walletTransaction.update({ where: { id: wplata.id }, data: { kwotaCofnieta: 54 } });
    const { dopasujProwizjeDoGotowki } = await import('../../src/partners/prowizje-a-cofniecia.js');
    await dopasujProwizjeDoGotowki(p as never, klient.id);
    expect((await p.partnerCommission.findUniqueOrThrow({ where: { id: narzut.id } })).status).toBe('CANCELED');
  });
});
