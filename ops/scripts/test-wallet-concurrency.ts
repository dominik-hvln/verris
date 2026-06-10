/**
 * Stress test współbieżności portfela (audit F-02) — DO URUCHOMIENIA NA
 * STAGINGU, nigdy na produkcji.
 *
 * Co robi:
 *   1. Tworzy użytkownika testowego z saldem 0.
 *   2. Wykonuje N równoległych kredytów po 1.00 i N równoległych debetów po
 *      0.50 (przez WalletLedgerService nie da się tu sięgnąć — skrypt używa
 *      tej samej semantyki SQL: FOR UPDATE + insert do ledgera).
 *   3. Asercja: saldo końcowe == suma wpisów ledgera == N*1.00 - N*0.50.
 *
 * Uruchomienie (z katalogu repo, wymaga DATABASE_URL stagingu):
 *   DATABASE_URL=postgres://… npx tsx ops/scripts/test-wallet-concurrency.ts
 */
import { PrismaClient, Prisma } from '@verris/database';

const N = 25;

async function applyEntry(
  prisma: PrismaClient,
  userId: string,
  amount: string,
  direction: 'credit' | 'debit',
  idempotencyKey: string,
) {
  const signed =
    direction === 'credit'
      ? new Prisma.Decimal(amount)
      : new Prisma.Decimal(amount).negated();
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ walletBalance: Prisma.Decimal; walletCurrency: string }>
    >`SELECT "walletBalance", "walletCurrency" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = rows[0];
    if (!user) throw new Error('user not found');
    const newBalance = new Prisma.Decimal(user.walletBalance).plus(signed);
    if (newBalance.isNegative()) throw new Error('insufficient');
    await tx.user.update({ where: { id: userId }, data: { walletBalance: newBalance } });
    await tx.walletTransaction.create({
      data: {
        userId,
        type: direction === 'credit' ? 'TOPUP' : 'CHARGE_USAGE',
        status: 'COMPLETED',
        amount: signed,
        currency: user.walletCurrency,
        balanceAfter: newBalance,
        idempotencyKey,
        description: 'concurrency stress test',
      },
    });
  });
}

async function main() {
  const prisma = new PrismaClient();
  const email = `wallet-stress-${Date.now()}@test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'x',
      role: 'USER',
      walletBalance: 0,
      referralCode: `STRESS-${Date.now()}`,
      ecoBadgeToken: `stress-${Date.now()}`,
    },
  });
  console.log(`[stress] user ${user.id}`);

  const jobs: Promise<unknown>[] = [];
  for (let i = 0; i < N; i++) {
    jobs.push(applyEntry(prisma, user.id, '1.00', 'credit', `stress-credit-${user.id}-${i}`));
  }
  await Promise.all(jobs);

  const debits: Promise<unknown>[] = [];
  for (let i = 0; i < N; i++) {
    debits.push(applyEntry(prisma, user.id, '0.50', 'debit', `stress-debit-${user.id}-${i}`));
  }
  await Promise.all(debits);

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const sum = await prisma.walletTransaction.aggregate({
    where: { userId: user.id },
    _sum: { amount: true },
  });
  const expected = new Prisma.Decimal('1.00').mul(N).minus(new Prisma.Decimal('0.50').mul(N));
  const balance = new Prisma.Decimal(fresh.walletBalance);
  const ledger = new Prisma.Decimal(sum._sum.amount ?? 0);

  console.log(`[stress] expected=${expected} balance=${balance} ledgerSum=${ledger}`);
  if (!balance.equals(expected) || !ledger.equals(expected)) {
    console.error('[stress] FAIL — saldo rozjechane z ledgerem');
    process.exit(1);
  }
  console.log('[stress] OK — saldo spójne z ledgerem przy pełnej współbieżności');

  // Sprzątanie
  await prisma.walletTransaction.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
