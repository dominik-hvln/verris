import { Injectable, Logger } from '@nestjs/common';
import {
  AutoscalingDirection,
  AutoscalingPriceRule,
  Prisma,
  WalletTxType,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import {
  hourlyCostBreakdownForCatalogAmounts,
  scaledDiskMbToCatalogGb,
  scaledRamMbToCatalogGb,
} from './autoscaling-pricing.util';

/**
 * Length of a single billing block. Autoscaling is billed in whole 15-minute
 * blocks, rounded up: the moment a scale-up happens the customer is charged for
 * the first block, and a sustained delta then bills block-by-block. A short
 * spike that reverts after 2 minutes still pays one full block (the minimum),
 * which closes the old revenue leak where anything reverting before the top of
 * the UTC hour was billed nothing at all.
 */
export const BILLING_BLOCK_MINUTES = 15;
const BILLING_BLOCK_MS = BILLING_BLOCK_MINUTES * 60 * 1000;
const BLOCK_FRACTION_OF_HOUR = BILLING_BLOCK_MINUTES / 60;

/** Below this the wallet column (Decimal(12,2)) would truncate to 0. */
const MIN_CHARGEABLE_PLN = 0.01;

/** Safety bound on how many missed blocks a single pass will settle at once. */
const MAX_BLOCKS_PER_PASS = 192; // = 48h of backlog

/** Minimal account shape the biller needs (engine passes it in-memory). */
export interface BillableAccount {
  id: string;
  subscriptionId: string;
  userId: string;
  domain: string;
  scaledCpu: number;
  scaledRamMb: number;
  scaledDiskMb: number;
  scaledSince: Date | null;
  scaledBilledUntil: Date | null;
}

export interface BlockBillingResult {
  blocksCharged: number;
  amountChargedPln: number;
  walletDepleted: boolean;
}

/**
 * Event-driven autoscaling billing.
 *
 * Both the engine (immediately after a scale-up, so brief spikes are billed
 * before they revert) and the scheduler cron (every few minutes, so sustained
 * deltas keep billing) call {@link billDueBlocks}. Each 15-minute block is
 * charged exactly once thanks to a deterministic idempotency key
 * `autoscale-block:<subId>:<blockStartEpochMs>`, so the two callers never
 * double-bill, and a mid-block restart/deploy is safe.
 */
@Injectable()
export class AutoscalingBillingService {
  private readonly logger = new Logger(AutoscalingBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService,
  ) {}

  /** Cost of one 15-minute block at the current scaled delta, in PLN. */
  blockCostPln(
    rules: AutoscalingPriceRule[],
    scaledCpu: number,
    scaledRamMb: number,
    scaledDiskMb: number,
  ): { total: number; cpu: number; ram: number; disk: number } {
    const hourly = hourlyCostBreakdownForCatalogAmounts(rules, {
      cpuPercent: scaledCpu,
      ramGb: scaledRamMbToCatalogGb(scaledRamMb),
      diskGb: scaledDiskMbToCatalogGb(scaledDiskMb),
    });
    return {
      total: hourly.total * BLOCK_FRACTION_OF_HOUR,
      cpu: hourly.cpu * BLOCK_FRACTION_OF_HOUR,
      ram: hourly.ram * BLOCK_FRACTION_OF_HOUR,
      disk: hourly.disk * BLOCK_FRACTION_OF_HOUR,
    };
  }

  /**
   * Charges every 15-minute block the account has *entered* since the last
   * billed boundary, at the rate of the account's current scaled delta. The
   * block the account is currently sitting in is billed up-front (round up).
   *
   * Advances `Account.scaledBilledUntil` as it goes; if it ever finds an active
   * scaled delta without an episode start it self-heals by opening one as of
   * now (so it only ever bills forward, never retroactively).
   */
  async billDueBlocks(
    account: BillableAccount,
    rules: AutoscalingPriceRule[],
    now: Date = new Date(),
  ): Promise<BlockBillingResult> {
    const hasScale =
      account.scaledCpu > 0 || account.scaledRamMb > 0 || account.scaledDiskMb > 0;

    // No active episode: make sure timestamps are cleared and stop.
    if (!hasScale) {
      if (account.scaledSince || account.scaledBilledUntil) {
        await this.prisma.account.update({
          where: { id: account.id },
          data: { scaledSince: null, scaledBilledUntil: null },
        });
      }
      return { blocksCharged: 0, amountChargedPln: 0, walletDepleted: false };
    }

    const since = account.scaledSince ?? now;
    let nextBlockStart = account.scaledBilledUntil ?? since;

    // Self-heal legacy/partial state (scaled but never tracked).
    if (!account.scaledSince || !account.scaledBilledUntil) {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { scaledSince: since, scaledBilledUntil: nextBlockStart },
      });
    }

    const block = this.blockCostPln(
      rules,
      account.scaledCpu,
      account.scaledRamMb,
      account.scaledDiskMb,
    );

    let blocksCharged = 0;
    let amountChargedPln = 0;
    let walletDepleted = false;
    let passes = 0;

    // A block is billed the instant the account enters it (blockStart <= now).
    while (nextBlockStart.getTime() <= now.getTime() && passes < MAX_BLOCKS_PER_PASS) {
      passes += 1;
      const blockStart = nextBlockStart;
      const amount = roundToCurrency(block.total);

      if (amount >= MIN_CHARGEABLE_PLN) {
        const share = allocateShares(amount, block);
        const idempotencyKey = `autoscale-block:${account.subscriptionId}:${blockStart.getTime()}`;
        try {
          const tx = await this.walletLedger.debit({
            userId: account.userId,
            type: WalletTxType.CHARGE_AUTOSCALING,
            amount,
            description:
              `Autoskalowanie — blok ${BILLING_BLOCK_MINUTES} min ` +
              `(cpu+${account.scaledCpu}% ram+${account.scaledRamMb}MB disk+${account.scaledDiskMb}MB)`,
            idempotencyKey,
            subscriptionId: account.subscriptionId,
            metadata: {
              kind: 'autoscaling_block',
              blockStart: blockStart.toISOString(),
              blockMinutes: BILLING_BLOCK_MINUTES,
              revenueCpuPln: share.cpu,
              revenueRamPln: share.ram,
              revenueDiskPln: share.disk,
            },
          });

          await this.prisma.autoscalingEvent.create({
            data: {
              subscriptionId: account.subscriptionId,
              direction: AutoscalingDirection.UP,
              reason: `block_charge ${BILLING_BLOCK_MINUTES}min tx=${tx.id}`,
              costSnapshot: new Prisma.Decimal(amount),
            },
          });

          amountChargedPln += amount;
          blocksCharged += 1;
        } catch (err) {
          const e = err as Error;
          if (e.message.toLowerCase().includes('insufficient')) {
            // Wallet is empty — stop here and DON'T advance past this block, so
            // we retry it after a top-up. The engine's guard will scale the
            // customer back to baseline + disable autoscaling on its next tick.
            walletDepleted = true;
            this.logger.warn(
              `Autoscaling block billing: wallet insufficient for sub=${account.subscriptionId} ` +
                `amount=${amount} — pausing, engine will disable shortly`,
            );
            break;
          }
          this.logger.error(
            `Autoscaling block billing failed for sub=${account.subscriptionId} ` +
              `amount=${amount}: ${e.message}`,
          );
          break;
        }
      }

      nextBlockStart = new Date(blockStart.getTime() + BILLING_BLOCK_MS);
    }

    // Persist how far we've billed (don't advance if the wallet stopped us).
    if (!walletDepleted && nextBlockStart.getTime() !== (account.scaledBilledUntil?.getTime() ?? -1)) {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { scaledSince: since, scaledBilledUntil: nextBlockStart },
      });
    }

    return { blocksCharged, amountChargedPln, walletDepleted };
  }

  /**
   * Total PLN charged for the autoscaling episode that started at `since`
   * (used for the scale-down summary email). Charges are stored as negative
   * debits, so we sum absolute values.
   */
  async episodeSpendPln(subscriptionId: string, since: Date): Promise<number> {
    const sum = await this.prisma.walletTransaction.aggregate({
      where: {
        subscriptionId,
        type: WalletTxType.CHARGE_AUTOSCALING,
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    });
    return Math.abs(Number(sum._sum.amount ?? 0));
  }
}

/**
 * Audit F-19: the wallet columns are Decimal(12,2) — rounding to 2 dp here
 * keeps the in-memory totals identical to what the DB actually stores (no
 * grosze drift between pass results and the ledger).
 */
function roundToCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function allocateShares(
  total: number,
  block: { cpu: number; ram: number; disk: number; total: number },
): { cpu: string; ram: string; disk: string } {
  if (block.total <= 0) return { cpu: '0', ram: '0', disk: '0' };
  const cpu = roundToCurrency((block.cpu / block.total) * total);
  const ram = roundToCurrency((block.ram / block.total) * total);
  const disk = roundToCurrency(Math.max(0, total - cpu - ram));
  return { cpu: cpu.toFixed(2), ram: ram.toFixed(2), disk: disk.toFixed(2) };
}
