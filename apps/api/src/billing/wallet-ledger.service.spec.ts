import { ConflictException } from '@nestjs/common';
import { Prisma, WalletTxType } from '@verris/database';
import { WalletLedgerService } from './wallet-ledger.service';

/**
 * Audit F-02 regressions:
 *  - the user row is locked (`SELECT … FOR UPDATE`) inside the transaction,
 *  - a concurrent duplicate (unique violation on idempotencyKey) resolves to
 *    the winner's ledger entry instead of throwing,
 *  - debits can never push the balance below zero.
 */
describe('WalletLedgerService (F-02)', () => {
  function buildPrismaMock(opts: {
    balance: string;
    existingByKey?: unknown | null;
    txError?: Error;
  }) {
    const createdRow = { id: 'tx-new', idempotencyKey: 'key-1' };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 'user-1',
          walletBalance: new Prisma.Decimal(opts.balance),
          walletCurrency: 'PLN',
        },
      ]),
      user: { update: jest.fn().mockResolvedValue({}) },
      walletTransaction: {
        create: jest.fn().mockResolvedValue(createdRow),
        update: jest.fn().mockResolvedValue({}),
      },
      // Z-01 — księga wystawia fakturę w TEJ SAMEJ transakcji, więc atrapa
      // transakcji musi mieć czym. Brak tego pola nie jest usterką testu,
      // tylko jego prawdziwym wynikiem: obciążenie dotyka teraz faktur.
      invoice: { create: jest.fn().mockResolvedValue({ id: 'inv-1', number: 'VFV/2026/08/0001' }) },
    };
    const prisma = {
      walletTransaction: {
        findUnique: jest.fn().mockResolvedValue(opts.existingByKey ?? null),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        if (opts.txError) throw opts.txError;
        return fn(tx);
      }),
    };
    return { prisma, tx, createdRow };
  }

  it('locks the user row with SELECT … FOR UPDATE', async () => {
    const { prisma, tx } = buildPrismaMock({ balance: '100.00' });
    const service = new WalletLedgerService(prisma as never);

    await service.debit({
      userId: 'user-1',
      amount: '10.00',
      type: WalletTxType.CHARGE_SUBSCRIPTION,
    });

    // PIERWSZE zapytanie surowe w transakcji ma blokować wiersz użytkownika.
    // Wcześniej stało tu `toHaveBeenCalledTimes(1)` — po Z-01 w tej samej
    // transakcji leci jeszcze numerator faktury, więc liczba wywołań przestała
    // opisywać to, o co temu testowi chodzi.
    const sqlParts: string[] = tx.$queryRaw.mock.calls[0][0];
    expect(sqlParts.join('?')).toContain('FOR UPDATE');
  });

  // ───────────────────────────────────────────────────────────────────────
  // Z-01 — faktura powstaje w tej samej transakcji co obciążenie
  // ───────────────────────────────────────────────────────────────────────

  it('obciążenie sprzedażowe wystawia fakturę wewnątrz transakcji', async () => {
    const { prisma, tx } = buildPrismaMock({ balance: '100.00' });
    const service = new WalletLedgerService(prisma as never);

    await service.debit({
      userId: 'user-1',
      amount: '45.00',
      type: WalletTxType.CHARGE_SUBSCRIPTION,
      description: 'Abonament',
    });

    expect(tx.invoice.create).toHaveBeenCalledTimes(1);
    const dane = tx.invoice.create.mock.calls[0][0].data;
    expect(dane.provider).toBe('WALLET');
    expect(dane.status).toBe('PAID');
    expect(dane.amount.toFixed(2)).toBe('45.00');
    expect(dane.netAmount.plus(dane.vatAmount).toFixed(2)).toBe('45.00');
  });

  it('autoskalowanie nie wystawia faktury przy obciążeniu', async () => {
    const { prisma, tx } = buildPrismaMock({ balance: '100.00' });
    const service = new WalletLedgerService(prisma as never);

    await service.debit({
      userId: 'user-1',
      amount: '0.12',
      type: WalletTxType.CHARGE_AUTOSCALING,
    });

    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('uznanie portfela nie wystawia faktury', async () => {
    const { prisma, tx } = buildPrismaMock({ balance: '0.00' });
    const service = new WalletLedgerService(prisma as never);

    await service.credit({ userId: 'user-1', amount: '200.00', type: WalletTxType.TOPUP });

    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('rejects a debit that would push the balance below zero', async () => {
    const { prisma } = buildPrismaMock({ balance: '5.00' });
    const service = new WalletLedgerService(prisma as never);

    await expect(
      service.debit({
        userId: 'user-1',
        amount: '10.00',
        type: WalletTxType.CHARGE_AUTOSCALING,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores debits as negative amounts and keeps balanceAfter consistent', async () => {
    const { prisma, tx } = buildPrismaMock({ balance: '100.00' });
    const service = new WalletLedgerService(prisma as never);

    await service.debit({
      userId: 'user-1',
      amount: '10.00',
      type: WalletTxType.CHARGE_AUTOSCALING,
    });

    const createArg = tx.walletTransaction.create.mock.calls[0][0].data;
    expect(new Prisma.Decimal(createArg.amount).toFixed(2)).toBe('-10.00');
    expect(new Prisma.Decimal(createArg.balanceAfter).toFixed(2)).toBe('90.00');
  });

  it('resolves a concurrent idempotency-key race (P2002) to the existing entry', async () => {
    const winner = { id: 'tx-winner', idempotencyKey: 'key-race' };
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique violation', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { prisma } = buildPrismaMock({ balance: '100.00', txError: p2002 });
    // First idempotency lookup (fast path) → null; after the race → winner.
    (prisma.walletTransaction.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    const service = new WalletLedgerService(prisma as never);

    const result = await service.debit({
      userId: 'user-1',
      amount: '10.00',
      type: WalletTxType.CHARGE_SUBSCRIPTION,
      idempotencyKey: 'key-race',
    });

    expect(result).toBe(winner);
  });

  it('short-circuits on an existing idempotency key without opening a transaction', async () => {
    const existing = { id: 'tx-existing', idempotencyKey: 'key-1', type: 'TOPUP' };
    const { prisma } = buildPrismaMock({ balance: '100.00', existingByKey: existing });
    const service = new WalletLedgerService(prisma as never);

    const result = await service.credit({
      userId: 'user-1',
      amount: '10.00',
      type: WalletTxType.TOPUP,
      idempotencyKey: 'key-1',
    });

    expect(result).toBe(existing);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
