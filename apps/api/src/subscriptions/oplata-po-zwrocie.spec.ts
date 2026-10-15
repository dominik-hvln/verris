import { ConflictException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Przegląd poprawek 15.10 — przebieg B trafia idempotentnie w obciążenie przebiegu A, któremu zakładanie padło
 * i który zwrócił pieniądze (usługa znów PENDING_PAYMENT). Bez sprawdzenia zwrotu B przestawiał usługę na zakładanie
 * — usługa bez opłaty.
 */
describe('Opłata z portfela po cudzym zwrocie', () => {
  it('trafienie w obciążenie, które już zwrócono → odmowa, bez przestawienia usługi i bez zakładania', async () => {
    const svc = Object.create(SubscriptionsService.prototype) as Record<string, unknown>;
    const updateMany = vi.fn(async () => ({ count: 1 }));
    svc.prisma = { subscription: { updateMany, findUniqueOrThrow: vi.fn() } };
    svc.walletLedger = {
      debit: vi.fn(async () => ({ id: 'tx-A' })),
      findByIdempotencyKey: vi.fn(async (k: string) => (k === 'sub-s1-initial-refund' ? { id: 'zwrot-A' } : null)),
      credit: vi.fn(),
    };
    const enqueue = vi.fn();
    svc.provisionQueue = { isAsync: () => true, enqueueWalletProvision: enqueue };
    svc.logger = { log: vi.fn(), error: vi.fn() };
    const zaplac = (svc as unknown as { payFromWalletAndProvision: (...a: unknown[]) => Promise<unknown> }).payFromWalletAndProvision.bind(svc);
    await expect(zaplac('s1', new Prisma.Decimal(45), new Prisma.Decimal(45), null, { interval: 'MONTH', domain: 'a.pl' }, 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
