import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WalletTransaction, WalletTxType, WalletTxStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

export interface LedgerEntryInput {
  userId: string;
  /** Always positive — sign is determined by `type` (TOPUP/CREDIT vs CHARGE/DEBIT). */
  amount: Prisma.Decimal | number | string;
  type: WalletTxType;
  description?: string;
  idempotencyKey?: string;
  paymentProvider?: string;
  paymentRef?: string;
  subscriptionId?: string;
  metadata?: Prisma.InputJsonValue;
}

const CREDIT_TYPES = new Set<WalletTxType>([
  WalletTxType.TOPUP,
  WalletTxType.REFUND,
  WalletTxType.PROMO_CREDIT,
  WalletTxType.CREDIT_PLAN_DOWNGRADE,
]);

const DEBIT_TYPES = new Set<WalletTxType>([
  WalletTxType.CHARGE_SUBSCRIPTION,
  WalletTxType.CHARGE_PLAN_UPGRADE,
  WalletTxType.CHARGE_AUTOSCALING,
  WalletTxType.CHARGE_USAGE,
  WalletTxType.CHARGE_DOMAIN,
]);

/**
 * Append-only wallet ledger.
 *
 * Every change to User.walletBalance MUST go through one of these methods so
 * that the row in WalletTransaction always matches the running balance and
 * gives us a complete, auditable history of money movements.
 *
 * Key guarantees:
 *   - The ledger insert and the User.walletBalance update happen in the same
 *     Prisma transaction (atomic).
 *   - Debits never bring balance below 0 (ConflictException otherwise).
 *   - Idempotency: if `idempotencyKey` is provided and a transaction with that
 *     key already exists, the existing transaction is returned unchanged.
 */
@Injectable()
export class WalletLedgerService {
  private readonly logger = new Logger(WalletLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async credit(input: LedgerEntryInput): Promise<WalletTransaction> {
    if (!CREDIT_TYPES.has(input.type) && input.type !== WalletTxType.ADJUSTMENT) {
      throw new BadRequestException(`Wallet credit cannot use type=${input.type}`);
    }
    return this.applyEntry(input, 'credit');
  }

  async debit(input: LedgerEntryInput): Promise<WalletTransaction> {
    if (!DEBIT_TYPES.has(input.type) && input.type !== WalletTxType.ADJUSTMENT) {
      throw new BadRequestException(`Wallet debit cannot use type=${input.type}`);
    }
    return this.applyEntry(input, 'debit');
  }

  /**
   * Look up an existing entry by idempotency key. Useful for webhook handlers
   * to short-circuit duplicate deliveries.
   */
  async findByIdempotencyKey(key: string): Promise<WalletTransaction | null> {
    return this.prisma.walletTransaction.findUnique({ where: { idempotencyKey: key } });
  }

  private async applyEntry(
    input: LedgerEntryInput,
    direction: 'credit' | 'debit',
  ): Promise<WalletTransaction> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        this.logger.log(
          `Idempotent ledger hit (key=${input.idempotencyKey}, type=${existing.type}, id=${existing.id})`,
        );
        return existing;
      }
    }

    const signedAmount = direction === 'credit' ? amount : amount.negated();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, walletBalance: true, walletCurrency: true },
      });
      if (!user) throw new NotFoundException('User not found');

      const newBalance = new Prisma.Decimal(user.walletBalance).plus(signedAmount);
      if (newBalance.isNegative()) {
        throw new ConflictException(
          'Insufficient wallet balance for this charge',
        );
      }

      await tx.user.update({
        where: { id: user.id },
        data: { walletBalance: newBalance },
      });

      const created = await tx.walletTransaction.create({
        data: {
          userId: user.id,
          type: input.type,
          status: WalletTxStatus.COMPLETED,
          amount: signedAmount,
          currency: user.walletCurrency,
          balanceAfter: newBalance,
          idempotencyKey: input.idempotencyKey ?? null,
          paymentProvider: input.paymentProvider ?? null,
          paymentRef: input.paymentRef ?? null,
          subscriptionId: input.subscriptionId ?? null,
          description: input.description ?? null,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
      });

      return created;
    });
  }
}
