import { Prisma } from '@verris/database';
import {
  AutoscalingBillingService,
  BILLING_BLOCK_MINUTES,
  BillableAccount,
} from './autoscaling-billing.service';

const BLOCK_MS = BILLING_BLOCK_MINUTES * 60 * 1000;

function rule(resource: string, price: string) {
  return {
    id: `${resource}-0`,
    resource,
    unit: resource === 'CPU' ? 'cpu_percent' : 'gb',
    pricePerUnit: new Prisma.Decimal(price),
    currency: 'PLN',
    thresholdAbove: 0,
    isActive: true,
    validFrom: new Date(),
    validUntil: null,
    notes: null,
    createdAt: new Date(),
  } as never;
}

function buildService(opts?: { debitError?: Error }) {
  const prisma = {
    account: { update: jest.fn().mockResolvedValue({}) },
    autoscalingEvent: { create: jest.fn().mockResolvedValue({}) },
    walletTransaction: { aggregate: jest.fn() },
  };
  const walletLedger = {
    debit: opts?.debitError
      ? jest.fn().mockRejectedValue(opts.debitError)
      : jest.fn().mockResolvedValue({ id: 'tx-1' }),
  };
  const service = new AutoscalingBillingService(prisma as never, walletLedger as never);
  return { service, prisma, walletLedger };
}

function account(over: Partial<BillableAccount> = {}): BillableAccount {
  return {
    id: 'acc-1',
    subscriptionId: 'sub-1',
    userId: 'user-1',
    domain: 'example.pl',
    scaledCpu: 100, // 100% CPU @ 0.01 PLN/%/h = 1 PLN/h = 0.25 PLN/block
    scaledRamMb: 0,
    scaledDiskMb: 0,
    scaledSince: null,
    scaledBilledUntil: null,
    ...over,
  };
}

describe('AutoscalingBillingService.billDueBlocks', () => {
  const rules = [rule('CPU', '0.01')];

  it('charges every entered 15-min block exactly once and advances the cursor', async () => {
    const { service, prisma, walletLedger } = buildService();
    const now = new Date('2026-06-09T12:00:00Z');
    const since = new Date(now.getTime() - 2 * BLOCK_MS); // entered 3 blocks (incl. current)

    const result = await service.billDueBlocks(
      account({ scaledSince: since, scaledBilledUntil: since }),
      rules as never,
      now,
    );

    expect(result.blocksCharged).toBe(3);
    expect(result.amountChargedPln).toBeCloseTo(0.75, 2);
    expect(result.walletDepleted).toBe(false);

    // Deterministic idempotency keys per block start.
    const keys = walletLedger.debit.mock.calls.map((c: never[]) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toBe(`autoscale-block:sub-1:${since.getTime()}`);

    // Cursor advanced past `now`.
    const lastUpdate = prisma.account.update.mock.calls.at(-1)![0].data;
    expect(lastUpdate.scaledBilledUntil.getTime()).toBeGreaterThan(now.getTime());
  });

  it('does NOT advance the cursor when the wallet is depleted (block retried after top-up)', async () => {
    const { service, prisma } = buildService({
      debitError: new Error('Insufficient wallet balance for this charge'),
    });
    const now = new Date('2026-06-09T12:00:00Z');
    const since = new Date(now.getTime() - BLOCK_MS);

    const result = await service.billDueBlocks(
      account({ scaledSince: since, scaledBilledUntil: since }),
      rules as never,
      now,
    );

    expect(result.walletDepleted).toBe(true);
    expect(result.blocksCharged).toBe(0);
    // No cursor write that would skip the unpaid block.
    const cursorWrites = prisma.account.update.mock.calls.filter(
      (c: never[]) => (c[0] as { data: { scaledBilledUntil?: unknown } }).data.scaledBilledUntil !== undefined,
    );
    // Only the self-heal write (same value) is allowed — never an advance.
    for (const call of cursorWrites) {
      const data = (call[0] as { data: { scaledBilledUntil: Date } }).data;
      expect(data.scaledBilledUntil.getTime()).toBeLessThanOrEqual(since.getTime());
    }
  });

  it('clears episode timestamps when the account is back at baseline', async () => {
    const { service, prisma, walletLedger } = buildService();
    const result = await service.billDueBlocks(
      account({
        scaledCpu: 0,
        scaledSince: new Date('2026-06-09T11:00:00Z'),
        scaledBilledUntil: new Date('2026-06-09T11:45:00Z'),
      }),
      rules as never,
      new Date('2026-06-09T12:00:00Z'),
    );

    expect(result.blocksCharged).toBe(0);
    expect(walletLedger.debit).not.toHaveBeenCalled();
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { scaledSince: null, scaledBilledUntil: null },
    });
  });

  it('opens a fresh episode (self-heal) instead of billing retroactively', async () => {
    const { service, walletLedger } = buildService();
    const now = new Date('2026-06-09T12:00:00Z');

    const result = await service.billDueBlocks(
      account({ scaledSince: null, scaledBilledUntil: null }),
      rules as never,
      now,
    );

    // Exactly one block — the one being entered right now.
    expect(result.blocksCharged).toBe(1);
    const key = (walletLedger.debit.mock.calls[0][0] as { idempotencyKey: string }).idempotencyKey;
    expect(key).toBe(`autoscale-block:sub-1:${now.getTime()}`);
  });
});
