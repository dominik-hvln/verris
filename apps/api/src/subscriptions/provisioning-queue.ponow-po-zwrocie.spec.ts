import { ProvisioningQueueService } from './provisioning-queue.service.js';

/**
 * Przegląd poprawek 15.10 — zamówienie cofnięte po twardej porażce zakładania (zwrot + PENDING_PAYMENT, od c36a4e2d
 * z currentPeriodStart/End = null). „Ponów” joba w adminie (retryJob) uruchamia runJob ponownie: provisionForSubscription
 * przyjmuje PENDING_PAYMENT i ustawia ACTIVE (provisioning.service.ts:316) — usługa aktywna, opłata zwrócona, a bez
 * currentPeriodEnd odnowienie (renewal.scheduler.ts:112, currentPeriodEnd lte) nigdy jej nie obejmie.
 */
describe('Kolejka zakładania — „Ponów” po zwrocie opłaty', () => {
  it('job „wallet” zamówienia ze zwrotem (sub-<id>-initial-refund) nie zakłada konta', async () => {
    const sub: Record<string, unknown> = { id: 's1', status: 'PENDING_PAYMENT', currentPeriodStart: null, currentPeriodEnd: null };
    const prisma = {
      account: { findUnique: vi.fn(async () => null) },
      subscription: {
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(sub, data)),
        findUnique: vi.fn(async () => ({ appliedPromoCodeId: null })),
      },
    };
    const provisioning = {
      // jak provisioning.service.ts:149-316 — PENDING_PAYMENT przepuszczone, na końcu status ACTIVE
      provisionForSubscription: vi.fn(async () => {
        sub.status = 'ACTIVE';
      }),
    };
    const ledger = {
      findByIdempotencyKey: vi.fn(async (k: string) => (k === 'sub-s1-initial-refund' ? { id: 'tx-zwrot', amount: 36 } : null)),
      credit: vi.fn(async () => ({})),
    };
    const audit = { record: vi.fn(async () => undefined) };
    const svc = new ProvisioningQueueService(prisma as never, provisioning as never, ledger as never, audit as never, {} as never);
    const job = { id: 's1', attemptsMade: 0, data: { type: 'wallet', subscriptionId: 's1', userId: 'u1', domain: 'a.pl', preferredRegion: null, refundAmount: '36' } };
    await expect((svc as unknown as { runJob: (j: unknown) => Promise<void> }).runJob(job)).rejects.toThrow(/zwrócona do portfela/);
    expect(provisioning.provisionForSubscription).not.toHaveBeenCalled();
    expect(ledger.credit).not.toHaveBeenCalled();
    expect(sub).not.toMatchObject({ status: 'ACTIVE', currentPeriodEnd: null });
  });
});
