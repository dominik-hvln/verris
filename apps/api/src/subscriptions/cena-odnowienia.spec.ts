import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@verris/database';
import { PromoService } from '../billing/promo.service.js';
import { UserServicesController } from './services.controller.js';

/**
 * t1 07.10: lista usług pokazywała 11,24 zł / mies. (pierwsza opłata z rabatem na start −10%),
 * choć odnowienie idzie pełną ceną 12,49. Panel dostaje kwotę najbliższego odnowienia z tego samego
 * źródła co scheduler i mail przypominający.
 */
const D = (v: string | number) => new Prisma.Decimal(v);
const sub = {
  id: 's1', status: 'ACTIVE', serviceTag: 'abc', paymentSource: 'WALLET', interval: 'MONTH', currency: 'PLN',
  priceAmount: D('11.24'), listPriceAmount: D('12.49'), appliedPromoCodeId: null, introDiscountPct: 10, introDiscountPeriodsLeft: 0,
  individualPrice: null, currentPeriodEnd: null, currentPeriodStart: null, ecoModeEnabled: false, autoscalingEnabled: false,
  isTrial: false, trialEndsAt: null, provisioningStage: null, account: null, healthSnapshots: [], events: [],
  plan: { id: 'p1', slug: 'poczta', name: 'Poczta Standard', productKind: 'EMAIL', description: null, cpuLimit: 50, ramLimitMb: 300, diskLimitMb: 5120 },
};

describe('Cena na liście usług = kwota odnowienia', () => {
  it('po zużytym rabacie na start: pełna cena, ostatnia opłata bez zmian', async () => {
    const prisma = { subscription: { findMany: vi.fn(async () => [sub]) } };
    const promo = new PromoService(null as never, null as never, null as never, null as never, null as never);
    const Ctrl = UserServicesController as unknown as new (...a: unknown[]) => UserServicesController;
    const ctrl = new Ctrl(prisma, ...Array(37).fill(null), promo);
    const [s] = (await ctrl.list({ userId: 'u1' })) as Array<{ priceAmount: string; renewalAmount: string }>;
    expect(s.priceAmount).toBe('11.24');
    expect(s.renewalAmount).toBe('12.49');
  });
});
