import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@verris/database';
import { PromoService } from '../billing/promo.service.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { UserServicesController } from './services.controller.js';

/**
 * P5-11 (decyzja 3.11.2026) — klient widzi lokalizację danych tylko jako „Unia Europejska”. Do tej pory szczegóły
 * i lista usług dla panelu klienta niosły nazwę węzła i jego region (`DE-FSN` → „Niemcy, Falkenstein”), czyli
 * pośrednio dostawcę i miasto centrum danych. Z bazy wybieramy już tylko id węzła.
 */
const selectWezla = (arg: unknown) =>
  (arg as { include: { account: { include: { server: { select: Record<string, boolean> } } } } }).include.account.include.server.select;

describe('P5-11 – usługa dla klienta bez nazwy i regionu węzła', () => {
  it('GET /subscriptions/:id (getForUser): select węzła = tylko id', async () => {
    const findFirst = vi.fn(async () => ({ id: 's1', plan: {}, account: { id: 'a1', domain: 'firma.pl', server: { id: 'w1' } } }));
    const svc = Object.create(SubscriptionsService.prototype) as SubscriptionsService;
    Object.assign(svc, { prisma: { subscription: { findFirst } } });
    await svc.getForUser('u1', 's1');
    expect(selectWezla((findFirst.mock.calls[0] as unknown[])[0])).toEqual({ id: true });
  });

  it('GET /services (lista): select węzła = tylko id, odpowiedź bez name i region', async () => {
    const sub = {
      id: 's1', status: 'ACTIVE', serviceTag: 'abc', paymentSource: 'WALLET', interval: 'MONTH', currency: 'PLN',
      priceAmount: new Prisma.Decimal('10'), listPriceAmount: new Prisma.Decimal('10'), appliedPromoCodeId: null, introDiscountPct: 0, introDiscountPeriodsLeft: 0,
      individualPrice: null, currentPeriodEnd: null, currentPeriodStart: null, ecoModeEnabled: false, autoscalingEnabled: false,
      isTrial: false, trialEndsAt: null, provisioningStage: null, healthSnapshots: [], events: [],
      plan: { id: 'p1', slug: 'start', name: 'Start', productKind: 'HOSTING', description: null, cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240 },
      // Gdyby baza oddała więcej (stary select), odpowiedź i tak nie może tego nieść.
      account: { id: 'a1', domain: 'firma.pl', daUsername: 'firma', status: 'ACTIVE', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240, scaledCpu: 0, scaledRamMb: 0, scaledDiskMb: 0, server: { id: 'w1', name: 'fsn-01', region: 'DE-FSN' } },
    };
    const findMany = vi.fn(async () => [sub]);
    const promo = new PromoService(null as never, null as never, null as never, null as never, null as never);
    const Ctrl = UserServicesController as unknown as new (...a: unknown[]) => UserServicesController;
    const ctrl = new Ctrl({ subscription: { findMany } }, ...Array(37).fill(null), promo);
    const [s] = (await ctrl.list({ userId: 'u1' })) as Array<{ account: { server: unknown } }>;
    expect(selectWezla((findMany.mock.calls[0] as unknown[])[0])).toEqual({ id: true });
    expect(s.account.server).toEqual({ id: 'w1' });
    expect(JSON.stringify(s)).not.toMatch(/fsn-01|DE-FSN/);
  });

  it('GET /services/:id: select węzła = tylko id', async () => {
    const findFirst = vi.fn(async () => null);
    const Ctrl = UserServicesController as unknown as new (...a: unknown[]) => UserServicesController;
    const ctrl = new Ctrl({ subscription: { findFirst } }, ...Array(38).fill(null));
    await expect(ctrl.get({ userId: 'u1' }, 's1')).rejects.toThrow('Nie znaleziono usługi.');
    expect(selectWezla((findFirst.mock.calls[0] as unknown[])[0])).toEqual({ id: true });
  });
});
