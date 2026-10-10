import { PromoKind, SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * X-04 — kody promocyjne na prawdziwej bazie. To ścieżka, która dopisuje pieniądze do portfela
 * bez wpłaty, więc sedno: każdy kod daje kredyt dokładnie raz na klienta, limit użyć trzyma się
 * także przy równoczesnych próbach, a ponowny webhook doładowania nie dubluje bonusu.
 */

function promo() {
  const p = prisma() as never;
  return new PromoService(p, new WalletLedgerService(p), new AuditService(p), { send: async () => ({}) } as never, { get: () => undefined } as never);
}

let n = 0;
const klient = () => {
  n += 1;
  return prisma().user.create({ data: { email: `promo-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 0 } });
};
const kod = (code: string, o: Record<string, unknown> = {}) =>
  prisma().promoCode.create({ data: { code, kind: PromoKind.FIXED_CREDIT, value: 50, currency: 'PLN', active: true, ...o } as never });
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const kredyty = (userId: string) => prisma().walletTransaction.count({ where: { userId, type: WalletTxType.PROMO_CREDIT } });

describe('X-04 kody promocyjne', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('voucher: kredyt raz, wpis w księdze i licznik użyć; drugi raz odmowa bez zmiany salda', async () => {
    const k = await klient();
    const c = await kod('START50');
    const wynik = await promo().redeemPromo(k.id, ' start50 ');
    expect(wynik.amountPln).toBe('50.00');
    expect(await saldo(k.id)).toBe(50);
    expect(await kredyty(k.id)).toBe(1);
    await expect(promo().redeemPromo(k.id, 'START50')).rejects.toThrow('Już zrealizowałeś');
    expect(await saldo(k.id)).toBe(50);
    expect((await prisma().promoCode.findUniqueOrThrow({ where: { id: c.id } })).redemptionCount).toBe(1);
  });

  it('podwójne kliknięcie (dwa równoczesne żądania) — portfel zasilony raz', async () => {
    const k = await klient();
    await kod('DWAKLIK');
    const s = promo();
    await Promise.allSettled([s.redeemPromo(k.id, 'DWAKLIK'), s.redeemPromo(k.id, 'DWAKLIK')]);
    expect(await saldo(k.id)).toBe(50);
    expect(await kredyty(k.id)).toBe(1);
  });

  it('limit użyć trzyma się przy równoczesnych próbach różnych klientów', async () => {
    await kod('JEDEN', { maxRedemptions: 1 });
    const k = await Promise.all([klient(), klient(), klient(), klient()]);
    const s = promo();
    const wyniki = await Promise.allSettled(k.map((x) => s.redeemPromo(x.id, 'JEDEN')));
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    const salda = await Promise.all(k.map((x) => saldo(x.id)));
    expect(salda.reduce((a, b) => a + b, 0)).toBe(50);
    expect(await prisma().promoRedemption.count()).toBe(1);
  });

  it('kod wygasły, nieaktywny i procentowy nie dają kredytu', async () => {
    const k = await klient();
    await kod('STARY', { validTo: new Date(Date.now() - 86400000) });
    await kod('WYLACZONY', { active: false });
    await kod('PROCENT', { kind: PromoKind.PERCENT_BONUS, value: 10 });
    await expect(promo().redeemPromo(k.id, 'STARY')).rejects.toThrow('wygasł');
    await expect(promo().redeemPromo(k.id, 'WYLACZONY')).rejects.toThrow('nieaktywny');
    await expect(promo().redeemPromo(k.id, 'PROCENT')).rejects.toThrow('doładowaniu');
    expect(await saldo(k.id)).toBe(0);
  });

  // Decyzja 07.10: kody Verris (kredyt na portfel i bonus do doładowania) nie obejmują klientów resellera.
  it('klient aktywnego resellera: voucher i bonus do doładowania odrzucone, portfel bez zmian', async () => {
    const r = await klient();
    await prisma().resellerProfile.create({ data: { userId: r.id, status: 'ACTIVE', markupPct: 0, code: `rsl_p${Date.now()}` } });
    const k = await prisma().user.create({ data: { email: `promo-rsl-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 0, resellerOwnerId: r.id } });
    await kod('PARTNER50');
    await kod('BONUS10', { kind: PromoKind.PERCENT_BONUS, value: 10 });
    await expect(promo().redeemPromo(k.id, 'PARTNER50')).rejects.toThrow('zapytaj partnera');
    await expect(promo().previewPercentBonus(k.id, 'BONUS10', new (await import('@verris/database')).Prisma.Decimal(100))).rejects.toThrow('zapytaj partnera');
    expect(await saldo(k.id)).toBe(0);
    expect(await kredyty(k.id)).toBe(0);
  });

  it('bonus procentowy do doładowania: ponowny webhook nie dubluje bonusu', async () => {
    const k = await klient();
    const c = await kod('PLUS10', { kind: PromoKind.PERCENT_BONUS, value: 10 });
    const s = promo();
    const podglad = await s.previewPercentBonus(k.id, 'plus10', new (await import('@verris/database')).Prisma.Decimal(200));
    expect(podglad.bonusAmount.toFixed(2)).toBe('20.00');
    const wej = { userId: k.id, promoCodeId: c.id, bonusAmount: podglad.bonusAmount, relatedWalletTxId: 'tx-topup', sessionId: 'cs_1' };
    const a = await s.applyPercentBonusForTopup(wej);
    const b = await s.applyPercentBonusForTopup(wej);
    expect(b.walletTxId).toBe(a.walletTxId);
    expect(await saldo(k.id)).toBe(20);
    expect(await kredyty(k.id)).toBe(1);
  });

  describe('kod rabatowy na zakup usługi (SERVICE_PERCENT_OFF)', () => {
    let kolejkaPada = false;
    const uslugi = () => {
      const p = prisma() as never;
      const ledger = new WalletLedgerService(p);
      const audit = new AuditService(p);
      const mailer = { send: async () => ({}) };
      const pr = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
      const queue = {
        isAsync: () => true,
        enqueueWalletProvision: async () => {
          if (kolejkaPada) throw new Error('kolejka niedostępna');
        },
      };
      const oferta = { cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0, introDiscountPeriods: 0 };
      return new SubscriptionsService(
        p, audit, ledger, null as never, { sprawdzMiejsce: async () => undefined } as never, queue as never, null as never,
        mailer as never, { get: () => undefined } as never, pr, null as never,
        { getTrialOffer: async () => oferta } as never, null as never,
      );
    };
    const zamow = (planId: string, domena: string, promoCode: string) =>
      ({ planId, interval: 'MONTH', paymentSource: 'WALLET', domain: domena, promoCode, immediatePerformanceConsent: true }) as never;
    const doladuj = (id: string, kwota: number) => prisma().user.update({ where: { id }, data: { walletBalance: kwota } });

    beforeEach(() => {
      kolejkaPada = false;
    });

    it('jeden klient nie użyje kodu „raz na klienta” na kilku usługach, zanim pierwsza się założy', async () => {
      const k = await klient();
      await doladuj(k.id, 200);
      const plan = await utworzPlan({ priceMonthly: 50 });
      await kod('MINUS50', { kind: PromoKind.SERVICE_PERCENT_OFF, value: 50 });
      await uslugi().create(k.id, zamow(plan.id, 'pierwsza.pl', 'MINUS50'));
      // Zakładanie jest w kolejce — rabat nie może zadziałać drugi raz.
      await expect(uslugi().create(k.id, zamow(plan.id, 'druga.pl', 'MINUS50'))).rejects.toThrow('Już zrealizowałeś');
      expect(await saldo(k.id)).toBe(175);
    });

    it('limit użyć trzyma się przy równoczesnych zakupach różnych klientów', async () => {
      const plan = await utworzPlan({ priceMonthly: 50 });
      await kod('JEDNARAZ', { kind: PromoKind.SERVICE_PERCENT_OFF, value: 50, maxRedemptions: 1 });
      const k = await Promise.all([klient(), klient(), klient()]);
      await Promise.all(k.map((x) => doladuj(x.id, 100)));
      const s = uslugi();
      const w = await Promise.allSettled(k.map((x, i) => s.create(x.id, zamow(plan.id, `sklep${i}.pl`, 'JEDNARAZ'))));
      expect(w.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma().promoRedemption.count()).toBe(1);
    });

    it('nieudany zakup oddaje kod — klient może go użyć ponownie', async () => {
      const k = await klient();
      await doladuj(k.id, 100);
      const plan = await utworzPlan({ priceMonthly: 50 });
      const c = await kod('WRACA', { kind: PromoKind.SERVICE_PERCENT_OFF, value: 50, maxRedemptions: 1 });
      kolejkaPada = true;
      await expect(uslugi().create(k.id, zamow(plan.id, 'pada.pl', 'WRACA'))).rejects.toThrow('kolejka niedostępna');
      expect(await saldo(k.id)).toBe(100);
      expect((await prisma().promoCode.findUniqueOrThrow({ where: { id: c.id } })).redemptionCount).toBe(0);
      kolejkaPada = false;
      await uslugi().create(k.id, zamow(plan.id, 'drugie-podejscie.pl', 'WRACA'));
      expect(await saldo(k.id)).toBe(75);
    });
  });
  // B1 — kod da się wyłączyć albo skrócić w trakcie akcji. Sedno: zmiana z panelu działa od razu
  // i na zakupie nowej usługi, i na odnowieniu z portfela (appliesToRenewals), a w dzienniku jest
  // stan przed i po.
  describe('B1 — wyłączenie i skrócenie kodu (PATCH)', () => {
    const admin = () =>
      prisma().user.create({ data: { email: `promo-admin-${Date.now()}-${Math.random()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } as never });
    const uslugi = () => {
      const p = prisma() as never;
      const ledger = new WalletLedgerService(p);
      const audit = new AuditService(p);
      const mailer = { send: async () => ({}) };
      const pr = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
      const queue = { isAsync: () => true, enqueueWalletProvision: async () => undefined };
      const oferta = { cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0, introDiscountPeriods: 0 };
      return new SubscriptionsService(
        p, audit, ledger, null as never, { sprawdzMiejsce: async () => undefined } as never, queue as never, null as never,
        mailer as never, { get: () => undefined } as never, pr, null as never,
        { getTrialOffer: async () => oferta } as never, null as never,
      );
    };
    const odnowienia = () => {
      const p = prisma() as never;
      const ledger = new WalletLedgerService(p);
      const subs = { finalizeScheduledCancellation: async () => null, suspend: async () => undefined, unsuspend: async () => undefined };
      const eco = { safeAward: () => undefined, awardSubscriptionRenewal: async () => undefined };
      return new RenewalScheduler(p, ledger, subs as never, new AuditService(p), promo(), eco as never);
    };
    const zamow = (planId: string, domena: string, promoCode: string) =>
      ({ planId, interval: 'MONTH', paymentSource: 'WALLET', domain: domena, promoCode, immediatePerformanceConsent: true }) as never;
    const uslugaZKodem = async (userId: string, promoCodeId: string) => {
      const plan = await utworzPlan({ priceMonthly: 100 });
      return prisma().subscription.create({
        data: {
          userId, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 50, listPriceAmount: 100,
          appliedPromoCodeId: promoCodeId, currency: 'PLN', paymentSource: 'WALLET',
          currentPeriodStart: new Date(Date.now() - 29 * 86400000), currentPeriodEnd: new Date(Date.now() + 12 * 3600000),
        } as never,
      });
    };

    it('wyłączony z panelu: zakup usługi z kodem odrzucony, portfel bez zmian; dziennik ma stan przed i po', async () => {
      const a = await admin();
      const k = await klient();
      await prisma().user.update({ where: { id: k.id }, data: { walletBalance: 200 } });
      const plan = await utworzPlan({ priceMonthly: 50 });
      const c = await kod('LATO50', { kind: PromoKind.SERVICE_PERCENT_OFF, value: 50, appliesToRenewals: true });
      await promo().updatePromoCode({ id: c.id, active: false, actorUserId: a.id });
      await expect(uslugi().create(k.id, zamow(plan.id, 'lato.pl', 'LATO50'))).rejects.toThrow('nieaktywny');
      expect(await saldo(k.id)).toBe(200);
      const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'PROMO_CODE_UPDATED' } });
      expect(wpis.actorUserId).toBe(a.id);
      expect(wpis.details).toMatchObject({ promoCodeId: c.id, before: { active: true }, after: { active: false } });
    });

    it('skrócony termin (validTo w przeszłości): zakup usługi z kodem odrzucony', async () => {
      const a = await admin();
      const k = await klient();
      await prisma().user.update({ where: { id: k.id }, data: { walletBalance: 200 } });
      const plan = await utworzPlan({ priceMonthly: 50 });
      const c = await kod('KONIEC', { kind: PromoKind.SERVICE_PERCENT_OFF, value: 50 });
      await promo().updatePromoCode({ id: c.id, validTo: new Date(Date.now() - 60000), actorUserId: a.id });
      await expect(uslugi().create(k.id, zamow(plan.id, 'koniec.pl', 'KONIEC'))).rejects.toThrow('wygasł');
      expect(await saldo(k.id)).toBe(200);
    });

    it('odnowienie: kod aktywny daje rabat, wyłączony lub przeterminowany — cena listowa', async () => {
      const a = await admin();
      const aktywny = await kod('ODN-AKT', { kind: PromoKind.SERVICE_PERCENT_OFF, value: 50, appliesToRenewals: true });
      const wylaczony = await kod('ODN-OFF', { kind: PromoKind.SERVICE_PERCENT_OFF, value: 50, appliesToRenewals: true });
      const stary = await kod('ODN-OLD', { kind: PromoKind.SERVICE_PERCENT_OFF, value: 50, appliesToRenewals: true });
      await promo().updatePromoCode({ id: wylaczony.id, active: false, actorUserId: a.id });
      await promo().updatePromoCode({ id: stary.id, validTo: new Date(Date.now() - 60000), actorUserId: a.id });
      const [k1, k2, k3] = await Promise.all([klient(), klient(), klient()]);
      await Promise.all([k1, k2, k3].map((k) => prisma().user.update({ where: { id: k.id }, data: { walletBalance: 300 } })));
      await uslugaZKodem(k1.id, aktywny.id);
      await uslugaZKodem(k2.id, wylaczony.id);
      await uslugaZKodem(k3.id, stary.id);
      await odnowienia().handleHourlyTick();
      expect(await saldo(k1.id)).toBe(250);
      expect(await saldo(k2.id)).toBe(200);
      expect(await saldo(k3.id)).toBe(200);
    });

    it('limit i opis: null zdejmuje limit, pusty opis = brak; zła data i ujemny limit — 400', async () => {
      const a = await admin();
      const c = await kod('LIMIT', { maxRedemptions: 5, description: 'stary' });
      const po = await promo().updatePromoCode({ id: c.id, maxRedemptions: null, description: '  ', actorUserId: a.id });
      expect(po.maxRedemptions).toBeNull();
      expect(po.description).toBeNull();
      await expect(promo().updatePromoCode({ id: c.id, validTo: new Date('x'), actorUserId: a.id })).rejects.toMatchObject({ status: 400 });
      await expect(promo().updatePromoCode({ id: c.id, maxRedemptions: -1, actorUserId: a.id })).rejects.toMatchObject({ status: 400 });
      await expect(promo().updatePromoCode({ id: c.id, actorUserId: a.id })).rejects.toMatchObject({ status: 400 });
    });
  });
});
