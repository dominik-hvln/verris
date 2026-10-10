import { Prisma } from '@verris/database';
import { BillingService } from './billing.service.js';

/**
 * Decyzja 10.10 — eksport transakcji portfela z panelu operatora (dane osobowe wszystkich klientów) trafia do dziennika
 * jak eksport list klientów i usług. Eksport klienta (własny portfel, bez operatora) nie jest logowany jako eksport operatora.
 */
function zbuduj() {
  const wiersz = {
    id: 't1', createdAt: new Date('2026-10-01T10:00:00Z'), userId: 'u1', user: { email: 'jan@firma.pl' }, type: 'TOPUP',
    status: 'COMPLETED', amount: new Prisma.Decimal('45.00'), currency: 'PLN', balanceAfter: new Prisma.Decimal('45.00'),
    description: null, paymentProvider: null, paymentRef: null, subscriptionId: null, idempotencyKey: null,
  };
  const prisma = { walletTransaction: { findMany: vi.fn(async () => [wiersz]) } };
  const audit = { record: vi.fn(async () => undefined) };
  const n = {} as never;
  const svc = new BillingService(prisma as never, n, n, audit as never, n, n, n, n, n, n, n);
  return { svc, audit };
}

it('eksport operatora zapisuje OPERATOR_LIST_EXPORTED z filtrami i liczbą wierszy', async () => {
  const { svc, audit } = zbuduj();
  const { csv } = await svc.exportTransactionsCsv({ userId: 'u1', from: new Date('2026-10-01T00:00:00Z') }, 'op-1');
  expect(csv).toContain('jan@firma.pl');
  expect(audit.record).toHaveBeenCalledWith({
    action: 'OPERATOR_LIST_EXPORTED',
    userId: 'u1',
    actorUserId: 'op-1',
    details: {
      lista: 'transakcje-portfela',
      filtry: { userId: 'u1', typ: null, od: '2026-10-01T00:00:00.000Z', do: null },
      wierszy: 1,
    },
  });
});

it('eksport klienta (bez operatora) nie trafia do dziennika jako eksport operatora', async () => {
  const { svc, audit } = zbuduj();
  await svc.exportTransactionsCsv({ userId: 'u1' });
  expect(audit.record).not.toHaveBeenCalled();
});
