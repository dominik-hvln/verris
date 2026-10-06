import { ForbiddenException } from '@nestjs/common';
import { Role } from '@verris/database';
import { TrialService } from './trial.service.js';

/**
 * PB-28 — klient rozliczany poza Verris (billingOutside) zamawia nowe usługi u opiekuna.
 * SubscriptionsService.create to blokował, a okres próbny szedł obok i zakładał usługę.
 */
describe('TrialService — PB-28 billingOutside', () => {
  const user = {
    role: Role.USER,
    emailVerifiedAt: new Date(),
    trialStartedAt: null,
    anonymizedAt: null,
    billingOutside: true,
  };
  const prisma = {
    plan: { findUnique: vi.fn(async () => ({ id: 'p1', isActive: true, isPublic: true, trialDays: 14 })) },
    user: { findUnique: vi.fn(async () => user), updateMany: vi.fn(async () => ({ count: 1 })) },
    subscription: { create: vi.fn() },
  };
  const svc = new TrialService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  it('eligibility odmawia klientowi rozliczanemu przez opiekuna', async () => {
    await expect(svc.eligibility('u1')).resolves.toEqual({ eligible: false, reason: 'BILLING_OUTSIDE' });
  });

  it('startTrial nie zajmuje slotu ani nie zakłada usługi', async () => {
    await expect(svc.startTrial('u1', { planId: 'p1', domain: 'a.pl' } as never)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });
});
