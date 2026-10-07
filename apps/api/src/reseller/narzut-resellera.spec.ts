import { BadRequestException } from '@nestjs/common';
import { Prisma, SubscriptionPaymentSource, SubscriptionStatus } from '@verris/database';
import { bezNarzutu, cenyDlaResellera, czescNarzutu, narzutResellera, zNarzutem } from './narzut-resellera.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { PlanChangeService } from '../subscriptions/plan-change.service.js';
import { TrialService } from '../subscriptions/trial.service.js';
import { PartnerCommissionScheduler } from '../partners/partner-commission.scheduler.js';
import { PartnersService } from '../partners/partners.service.js';
import { ResellerKlienciService } from './reseller-klienci.service.js';

/** O-07 — klient resellera płaci cennik + narzut, a narzut wraca do resellera jako prowizja. */

const D = (v: number | string) => new Prisma.Decimal(v);
const config = (wlaczony: boolean) => ({ get: (k: string) => (k === 'FEATURE_RESELLER_MARKUP' && wlaczony ? 'true' : undefined) });
const prismaKlienta = (profil: { status: string; markupPct: number } | null, ownerId: string | null = 'r1') => ({
  user: { findUnique: vi.fn(async () => ({ billingOutside: false, resellerOwnerId: ownerId })) },
  resellerProfile: { findUnique: vi.fn(async () => profil) },
});

describe('O-07 — narzut resellera: helper', () => {
  it('flaga wyłączona → 0, bez zaglądania do bazy', async () => {
    const p = prismaKlienta({ status: 'ACTIVE', markupPct: 20 });
    expect(await narzutResellera(p as never, config(false), 'u1')).toBe(0);
    expect(p.user.findUnique).not.toHaveBeenCalled();
  });

  it('klient bez resellera albo reseller nieaktywny → 0; aktywny → markupPct', async () => {
    expect(await narzutResellera(prismaKlienta({ status: 'ACTIVE', markupPct: 20 }, null) as never, config(true), 'u1')).toBe(0);
    expect(await narzutResellera(prismaKlienta({ status: 'SUSPENDED', markupPct: 20 }) as never, config(true), 'u1')).toBe(0);
    expect(await narzutResellera(prismaKlienta({ status: 'PENDING', markupPct: 20 }) as never, config(true), 'u1')).toBe(0);
    expect(await narzutResellera(prismaKlienta({ status: 'ACTIVE', markupPct: 20 }) as never, config(true), 'u1')).toBe(20);
  });

  it('FEATURE_RESELLER_MARKUP_TYLKO_KONTA: narzut tylko u klientów resellera z listy (nawet przy fladze false)', async () => {
    const cfg = { get: (k: string) => ({ FEATURE_RESELLER_MARKUP: 'false', FEATURE_RESELLER_MARKUP_TYLKO_KONTA: ' Test@hvln.pl ' })[k] };
    const zResellerem = (email: string) => ({
      user: { findUnique: vi.fn(async () => ({ resellerOwnerId: 'r1' })) },
      resellerProfile: { findUnique: vi.fn(async () => ({ status: 'ACTIVE', markupPct: 20, user: { email } })) },
    });
    expect(await narzutResellera(zResellerem('test@hvln.pl') as never, cfg, 'u1')).toBe(20);
    expect(await narzutResellera(zResellerem('inny@firma.pl') as never, cfg, 'u1')).toBe(0);
    // lista ma pierwszeństwo także przed FEATURE_RESELLER_MARKUP=true
    const cfgTrue = { get: (k: string) => ({ FEATURE_RESELLER_MARKUP: 'true', FEATURE_RESELLER_MARKUP_TYLKO_KONTA: 'test@hvln.pl' })[k] };
    expect(await narzutResellera(zResellerem('inny@firma.pl') as never, cfgTrue, 'u1')).toBe(0);
  });

  it('zaokrąglenia do grosza HALF_UP', () => {
    expect(zNarzutem(D(45), 20).toFixed(2)).toBe('54.00');
    expect(zNarzutem(D('19.99'), 15).toFixed(2)).toBe('22.99'); // 22,9885
    expect(zNarzutem(D('0.05'), 50).toFixed(2)).toBe('0.08'); // 0,075
    expect(zNarzutem(D(45), 0).toFixed(2)).toBe('45.00');
    expect(bezNarzutu(D(54), 20).toFixed(2)).toBe('45.00');
    expect(bezNarzutu(D('22.99'), 15).toFixed(2)).toBe('19.99');
    expect(czescNarzutu(D(-54), 20).toFixed(2)).toBe('9.00');
    expect(czescNarzutu(D('47.99'), 15).toFixed(2)).toBe('6.26'); // 6,2596
  });

  it('widok resellera: usługa ze snapshotem ma narzut już w cenie (bez podwójnego doliczania)', () => {
    expect(cenyDlaResellera(D(54), 20)).toEqual({ hurt: 45, detal: 54 });
    // Bez snapshotu klient płaci swoją cenę (sprzed narzutu) — detal = hurt, nie „po bieżącym narzucie” (07.10).
    expect(cenyDlaResellera(D(45), null)).toEqual({ hurt: 45, detal: 45 });
  });
});

describe('O-07 — zakup usługi', () => {
  const STOP = new Error('STOP');
  const zbuduj = (o: { flaga?: boolean; profil?: { status: string; markupPct: number } | null; oferta?: Record<string, unknown> } = {}) => {
    const p = prismaKlienta(o.profil === undefined ? { status: 'ACTIVE', markupPct: 20 } : o.profil);
    const create = vi.fn(async () => {
      throw STOP;
    });
    const prisma = {
      ...p,
      plan: { findUnique: vi.fn(async () => ({ id: 'p1', isActive: true, isPublic: true, productKind: 'HOSTING', priceMonthly: D(45), priceYearly: D(399), currency: 'PLN' })) },
      subscription: { findUnique: vi.fn(async () => null), create },
      account: { findUnique: vi.fn(async () => null) },
    };
    const settings = { getTrialOffer: vi.fn(async () => o.oferta ?? { cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0, introDiscountPeriods: 0 }) };
    const vat = { ustal: vi.fn(async () => ({ traktowanie: { cenaNetto: false } })) };
    const n = {} as never;
    const svc = new SubscriptionsService(prisma as never, n, n, n, n, n, n, n, config(o.flaga ?? true) as never, n, n, settings as never, vat as never);
    return { svc, create };
  };
  const dto = (paymentSource: SubscriptionPaymentSource) => ({ planId: 'p1', interval: 'MONTH', paymentSource, domain: 'x.pl' }) as never;
  const zapisane = (create: ReturnType<typeof vi.fn>) => (create.mock.calls[0] as unknown as [{ data: Record<string, Prisma.Decimal | number | null> }])[0].data;

  it('portfel: cena z narzutem i snapshot procentu', async () => {
    const { svc, create } = zbuduj();
    await expect(svc.create('u1', dto(SubscriptionPaymentSource.WALLET))).rejects.toBe(STOP);
    const d = zapisane(create);
    expect(String(d.listPriceAmount)).toBe('54');
    expect(String(d.priceAmount)).toBe('54');
    expect(d.resellerMarkupPct).toBe(20);
  });

  // Decyzja 07.10: rabat na start to promocja Verris — klient resellera płaci pełną cenę z narzutem.
  it('rabat startowy nie obejmuje klienta resellera', async () => {
    const { svc, create } = zbuduj({ oferta: { cardEnabled: true, monthlyDiscountPct: 50, annualDiscountPct: 0, introDiscountPeriods: 1 } });
    await expect(svc.create('u1', dto(SubscriptionPaymentSource.WALLET))).rejects.toBe(STOP);
    expect(String(zapisane(create).priceAmount)).toBe('54');
    expect(zapisane(create).introDiscountPct).toBe(0);
  });

  it('flaga wyłączona: cennik, bez snapshotu', async () => {
    const { svc, create } = zbuduj({ flaga: false });
    await expect(svc.create('u1', dto(SubscriptionPaymentSource.WALLET))).rejects.toBe(STOP);
    const d = zapisane(create);
    expect(String(d.listPriceAmount)).toBe('45');
    expect(d.resellerMarkupPct).toBeNull();
  });

  it('cena indywidualna operatora: bez narzutu', async () => {
    const { svc, create } = zbuduj();
    await expect(
      svc.create('u1', dto(SubscriptionPaymentSource.MANUAL), { allowManual: true, operator: { actorUserId: 'a1', powod: 'oferta', individualPrice: D(30) } }),
    ).rejects.toBe(STOP);
    const d = zapisane(create);
    expect(String(d.listPriceAmount)).toBe('45');
    expect(String(d.priceAmount)).toBe('30');
    expect(d.resellerMarkupPct).toBeNull();
  });

  it('karta dla klienta z narzutem — odmowa z podpowiedzią portfela', async () => {
    const { svc, create } = zbuduj();
    const wynik = svc.create('u1', dto(SubscriptionPaymentSource.STRIPE_CARD));
    await expect(wynik).rejects.toThrow(BadRequestException);
    await expect(wynik).rejects.toThrow(/portfel/);
    expect(create).not.toHaveBeenCalled();
  });

  it('kod rabatowy Verris odrzucony dla klienta resellera', async () => {
    const { svc } = zbuduj();
    const promo = { previewServicePercentOff: vi.fn() };
    (svc as unknown as { promo: unknown }).promo = promo;
    await expect(svc.previewSubscriptionPromo('u1', { planId: 'p1', interval: 'MONTH', code: 'X' } as never)).rejects.toThrow(/partner/);
    expect(promo.previewServicePercentOff).not.toHaveBeenCalled();
  });
});

describe('O-07 — zmiana planu i przejście z okresu próbnego', () => {
  it('zmiana planu: dopłata i nowa cena od ceny z narzutem, snapshot procentu', async () => {
    const sub = {
      id: 'sub-1', userId: 'u1', planId: 'plan-a', status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: D(100),
      currency: 'PLN', paymentSource: SubscriptionPaymentSource.WALLET, individualPrice: null,
      currentPeriodStart: new Date('2099-01-01'), currentPeriodEnd: new Date('2099-01-31'), updatedAt: new Date('2026-10-01'),
      autoscalingEnabled: false,
      plan: { id: 'plan-a', slug: 'a', name: 'A', diskLimitMb: 5120, cpuLimit: 100, ramLimitMb: 1024, ioLimitKbps: 1, iopsLimit: 1, entryProcesses: 1, nprocLimit: 1 },
      account: { id: 'acc', domain: 'x.pl', serverId: 's', daUsername: 'x', scaledCpu: 0, scaledRamMb: 0, scaledDiskMb: 0 },
      user: { id: 'u1', email: 'u@x.pl', firstName: null, walletBalance: D(1000) },
    };
    const txUpdate = vi.fn(async () => ({ id: 'sub-1' }));
    const prisma = {
      ...prismaKlienta({ status: 'ACTIVE', markupPct: 20 }),
      plan: { findUnique: vi.fn(async () => ({ id: 'plan-b', slug: 'b', name: 'B', isActive: true, isPublic: true, diskLimitMb: 10240, cpuLimit: 200, ramLimitMb: 2048, ioLimitKbps: 1, iopsLimit: 1, entryProcesses: 1, nprocLimit: 1, priceMonthly: D(200), priceYearly: D(2000) })) },
      usageMetric: { findMany: vi.fn(async () => []) },
      subscription: { findFirst: vi.fn(async () => sub), updateMany: vi.fn(async () => ({ count: 1 })) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn({ account: { update: vi.fn() }, server: { update: vi.fn() }, subscription: { update: txUpdate }, subscriptionEvent: { create: vi.fn() } }),
      ),
    };
    const debit = vi.fn(async () => ({ id: 'tx-1' }));
    const da = { getClientForServer: vi.fn(async () => ({ setAccountLimits: vi.fn() })) };
    const svc = new PlanChangeService(prisma as never, { record: vi.fn() } as never, { debit, credit: vi.fn() } as never, {} as never, da as never, { send: vi.fn() } as never, config(true) as never);
    await svc.changeForUser('u1', 'sub-1', 'plan-b');
    // Okres zaczyna się w przyszłości → cały okres do dopłaty: 240 − 100.
    expect(String((debit.mock.calls[0] as unknown as [{ amount: Prisma.Decimal }])[0].amount)).toBe('140');
    const data = (txUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(String(data.priceAmount)).toBe('240');
    expect(String(data.listPriceAmount)).toBe('240');
    expect(data.resellerMarkupPct).toBe(20);
  });

  it('przejście z okresu próbnego: obciążenie i cena odnowień z narzutem', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      ...prismaKlienta({ status: 'ACTIVE', markupPct: 20 }),
      subscription: {
        findFirst: vi.fn(async () => ({ id: 's1', isTrial: true, trialConvertedAt: null, status: SubscriptionStatus.ACTIVE, plan: { name: 'A', priceMonthly: D(45) } })),
        updateMany,
      },
      subscriptionEvent: { create: vi.fn() },
    };
    const debit = vi.fn(async () => ({ id: 'tx' }));
    const svc = new TrialService(prisma as never, { record: vi.fn() } as never, { send: vi.fn() } as never, { debit } as never, {} as never, {} as never, config(true) as never);
    await svc.convertFromWallet('u1', 's1');
    expect(String((debit.mock.calls[0] as unknown as [{ amount: Prisma.Decimal }])[0].amount)).toBe('54');
    const data = (updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(String(data.listPriceAmount)).toBe('54');
    expect(data.resellerMarkupPct).toBe(20);
  });
});

describe('O-07 — prowizja resellera (scheduler)', () => {
  const zbuduj = () => {
    const klucze = new Map<string, Record<string, unknown>>();
    const txFind = vi.fn(async () => [
      { id: 'w1', userId: 'c1', amount: D(-54), currency: 'PLN', createdAt: new Date('2026-10-05T10:00:00Z'), subscription: { resellerMarkupPct: 20 } },
      { id: 'w2', userId: 'c1', amount: D('-47.99'), currency: 'PLN', createdAt: new Date('2026-10-05T10:00:00Z'), subscription: { resellerMarkupPct: 15 } },
    ]);
    const prisma = {
      walletTransaction: { findMany: txFind },
      user: { findUnique: vi.fn(async () => ({ resellerOwnerId: 'r1', referredByUserId: null })) },
      partnerCommission: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async (a: { where: { dedupeKey: string } }) => (klucze.has(a.where.dedupeKey) ? { id: 'x' } : null)),
        create: vi.fn(async (a: { data: Record<string, unknown> }) => {
          klucze.set(a.data.dedupeKey as string, a.data);
          return { id: 'x' };
        }),
      },
    };
    // Program poleceń WYŁĄCZONY — prowizja resellera i tak ma się naliczyć.
    const settings = { getPartnerProgram: vi.fn(async () => ({ enabled: false, commissionPct: 0, holdDays: 14, freeHostingThreshold: 0, freeHostingCredit: 0 })) };
    return { s: new PartnerCommissionScheduler(prisma as never, settings as never), klucze, txFind, prisma };
  };

  it('nalicza część narzutu z opłaty, idempotentnie, przy wyłączonym programie poleceń', async () => {
    const { s, klucze, txFind, prisma } = zbuduj();
    await s.run();
    await s.run();
    expect(prisma.partnerCommission.create).toHaveBeenCalledTimes(2);
    const w1 = klucze.get('rsl:w1')!;
    expect(w1).toMatchObject({ partnerUserId: 'r1', referredUserId: 'c1', kind: 'RESELLER_MARKUP', pct: 20, status: 'PENDING' });
    expect(String(w1.amount)).toBe('9');
    expect(String(klucze.get('rsl:w2')!.amount)).toBe('6.26');
    expect((w1.availableAt as Date).toISOString()).toBe('2026-10-19T10:00:00.000Z');
    const where = (txFind.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.subscription).toEqual({ resellerMarkupPct: { gt: 0 }, individualPrice: null });
  });
});

describe('O-07 — wypłata prowizji przez aktywnego resellera', () => {
  it('reseller bez zapisu do programu poleceń, przy wyłączonym programie, wypłaca do portfela', async () => {
    const prisma = {
      resellerProfile: { findUnique: vi.fn(async () => ({ status: 'ACTIVE' })) },
      referralProgramEnrollment: { findUnique: vi.fn(async () => null) },
      partnerCommission: {
        findMany: vi.fn(async () => [{ id: 'c1', amount: D(9) }]),
        updateMany: vi.fn(async () => ({ count: 1 })),
        aggregate: vi.fn(async () => ({ _sum: { amount: D(9) } })),
      },
      partnerPayout: { create: vi.fn(async () => ({ id: 'po1' })), update: vi.fn(async () => ({})) },
    };
    const credit = vi.fn(async () => ({ id: 'wtx' }));
    const settings = { getPartnerProgram: vi.fn(async () => ({ enabled: false, minPayout: 50 })) };
    const svc = new PartnersService(prisma as never, { record: vi.fn() } as never, { credit } as never, settings as never);
    await expect(svc.requestWalletPayout('r1')).resolves.toEqual({ amount: 9, payoutId: 'po1' });
    expect(credit).toHaveBeenCalled();
  });

  it('zwykłe konto bez programu dalej dostaje odmowę', async () => {
    const prisma = {
      resellerProfile: { findUnique: vi.fn(async () => ({ status: 'SUSPENDED' })) },
      referralProgramEnrollment: { findUnique: vi.fn(async () => null) },
    };
    const settings = { getPartnerProgram: vi.fn(async () => ({ enabled: true, minPayout: 50 })) };
    const svc = new PartnersService(prisma as never, {} as never, {} as never, settings as never);
    await expect(svc.requestWalletPayout('u1')).rejects.toThrow(/partnerem/);
  });
});

describe('O-07 — odpięcie od resellera przywraca cennik', () => {
  const zbuduj = () => {
    const txSubUpdate = vi.fn(async () => ({}));
    const txUserUpdate = vi.fn(async () => ({}));
    const txFindMany = vi.fn(async () => [{ id: 's1', priceAmount: D(27), listPriceAmount: D(54), resellerMarkupPct: 20 }]);
    const tx = { user: { update: txUserUpdate }, subscription: { findMany: txFindMany, update: txSubUpdate }, subscriptionEvent: { create: vi.fn() } };
    const prisma = {
      resellerProfile: { findUnique: vi.fn(async () => ({ status: 'ACTIVE', brandName: 'Studio', code: 'rsl_x' })) },
      user: {
        findFirst: vi.fn(async () => ({ id: 'c1', email: 'c@x.pl', firstName: null, lastName: null, createdAt: new Date() })),
        findUnique: vi.fn(async () => ({ resellerOwnerId: 'r1', email: 'c@x.pl' })),
      },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const svc = new ResellerKlienciService(prisma as never, { record: vi.fn() } as never, { send: vi.fn() } as never, {} as never, config(true) as never);
    return { svc, txSubUpdate, txUserUpdate, txFindMany };
  };

  it.each([
    ['reseller odpina klienta', (s: ResellerKlienciService) => s.odepnij('r1', 'c1')],
    ['klient odpina się sam', (s: ResellerKlienciService) => s.odepnijSie('c1')],
  ])('%s — ceny bez narzutu w tej samej transakcji co odpięcie', async (_n, akcja) => {
    const { svc, txSubUpdate, txUserUpdate, txFindMany } = zbuduj();
    await akcja(svc);
    expect(txUserUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { resellerOwnerId: null } });
    expect((txFindMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where).toMatchObject({ resellerMarkupPct: { gt: 0 } });
    const data = (txSubUpdate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(String(data.priceAmount)).toBe('22.5');
    expect(String(data.listPriceAmount)).toBe('45');
    expect(data.resellerMarkupPct).toBeNull();
  });
});
