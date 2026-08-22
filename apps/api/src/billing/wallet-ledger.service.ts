import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WalletTransaction, WalletTxType, WalletTxStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { trybFaktury, utworzFaktureZaObciazenie } from './faktura-za-portfel';

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
  // RESELL — wypłata prowizji partnerskiej. Wartość enuma dodana w migracji;
  // generowany klient Prisma dostaje ją w buildzie prod, więc rzutujemy string.
  'COMMISSION_CREDIT' as WalletTxType,
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

    // Fast-path idempotency check (outside the transaction). The authoritative
    // guarantee is the unique constraint on `idempotencyKey` + the P2002
    // handler below — this read just avoids opening a transaction for the
    // common webhook-retry case.
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

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Audit F-02: lock the user row for the duration of the transaction.
        // Without `FOR UPDATE`, two concurrent entries (renewal cron +
        // autoscaling block + top-up webhook…) could read the same balance and
        // overwrite each other (lost update under READ COMMITTED).
        const locked = await tx.$queryRaw<
          Array<{ id: string; walletBalance: Prisma.Decimal; walletCurrency: string }>
        >`SELECT "id", "walletBalance", "walletCurrency" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
        const user = locked[0];
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

        // Z-01 — faktura powstaje TUTAJ, w tej samej transakcji co ruch
        // pieniądza, a nie w trzynastu miejscach, które wołają księgę.
        //
        // Trzynastu, nie czterech: macierz wymieniała cztery wywołania
        // `debit()`, a jest ich trzynaście. To nie jest zarzut wobec macierzy,
        // tylko dowód, że lista miejsc, w których rusza się pieniądz,
        // rozjeżdża się z rzeczywistością szybciej, niż ktokolwiek ją
        // aktualizuje. Reguła w jednym miejscu nie ma jak się rozjechać.
        //
        // Wiersz faktury jest atomowy z obciążeniem. Wszystko, co wymaga
        // świata zewnętrznego — PDF, MinIO, KSeF, mail — robi później
        // scheduler finalizacji, z ponawianiem. Lekcja z Z-05: dokument,
        // którego powstanie zależy od kroku po transakcji, będzie czasem
        // nie powstawał i nikt się o tym nie dowie.
        if (direction === 'debit') {
          const tryb = trybFaktury(input.type, amount);
          if (tryb === 'natychmiast') {
            await utworzFaktureZaObciazenie(tx, {
              userId: user.id,
              walletTxId: created.id,
              typ: input.type,
              brutto: amount,
              waluta: user.walletCurrency,
              opis: input.description ?? null,
              subscriptionId: input.subscriptionId ?? null,
              teraz: new Date(),
            });
          }
          // `zbiorczo` nie robi nic teraz — wpis zostaje z `invoiceId = null`
          // i podejmie go miesięczny scheduler faktur zbiorczych. NULL jest
          // tu znaczący, dlatego indeks (type, invoiceId, createdAt).
        }

        return created;
      });
    } catch (err) {
      // Concurrent duplicate with the same idempotency key: the loser of the
      // race hits the unique constraint — return the winner's entry instead of
      // surfacing an error (the money moved exactly once).
      if (
        input.idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.findByIdempotencyKey(input.idempotencyKey);
        if (existing) {
          this.logger.log(
            `Idempotent ledger race resolved (key=${input.idempotencyKey}, id=${existing.id})`,
          );
          return existing;
        }
      }
      throw err;
    }
  }
}
