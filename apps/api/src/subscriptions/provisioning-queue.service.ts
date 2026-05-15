import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus, WalletTxType } from '@verris/database';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { AuditService } from '../common/audit/audit.service';
import { ProvisioningService } from './provisioning.service';

export type ProvisionJobData =
  | {
      type: 'wallet';
      subscriptionId: string;
      userId: string;
      domain: string;
      preferredRegion: string | null;
      refundAmount: string;
    }
  | {
      type: 'manual';
      subscriptionId: string;
      userId: string;
      domain: string;
      preferredRegion: string | null;
    }
  | {
      type: 'stripe';
      subscriptionId: string;
      userId: string;
      domain: string;
      preferredRegion: string | null;
      stripeSubscriptionId: string;
    };

const QUEUE_NAME = 'provisioning';

@Injectable()
export class ProvisioningQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProvisioningQueueService.name);
  private connection: IORedis | null = null;
  private queue: Queue<ProvisionJobData> | null = null;
  private worker: Worker<ProvisionJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly walletLedger: WalletLedgerService,
    private readonly audit: AuditService,
  ) {}

  isAsync(): boolean {
    return Boolean(process.env.REDIS_URL?.trim());
  }

  onModuleInit() {
    if (!this.isAsync()) {
      this.logger.log('REDIS_URL not set — provisioning requests stay synchronous.');
      return;
    }
    const url = process.env.REDIS_URL!.trim();
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue<ProvisionJobData>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });

    this.worker = new Worker<ProvisionJobData>(
      QUEUE_NAME,
      async (job: Job<ProvisionJobData>) => this.runJob(job),
      {
        connection: this.connection,
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Provisioning job failed id=${job?.id} name=${job?.name}: ${err instanceof Error ? err.message : err}`,
      );
    });

    this.logger.log('BullMQ provisioning worker started (REDIS_URL set).');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    if (this.connection) {
      await this.connection.quit();
    }
  }

  async enqueueWalletProvision(data: {
    subscriptionId: string;
    userId: string;
    domain: string;
    preferredRegion: string | null;
    refundAmount: Prisma.Decimal;
  }): Promise<void> {
    if (!this.queue) throw new Error('Provisioning queue not initialized');
    await this.queue.add('wallet', {
      type: 'wallet',
      subscriptionId: data.subscriptionId,
      userId: data.userId,
      domain: data.domain,
      preferredRegion: data.preferredRegion,
      refundAmount: data.refundAmount.toString(),
    });
  }

  async enqueueManualProvision(data: {
    subscriptionId: string;
    userId: string;
    domain: string;
    preferredRegion: string | null;
  }): Promise<void> {
    if (!this.queue) throw new Error('Provisioning queue not initialized');
    await this.queue.add('manual', {
      type: 'manual',
      ...data,
    });
  }

  async enqueueStripeProvision(data: {
    subscriptionId: string;
    userId: string;
    domain: string;
    preferredRegion: string | null;
    stripeSubscriptionId: string;
  }): Promise<void> {
    if (!this.queue) throw new Error('Provisioning queue not initialized');
    await this.queue.add('stripe', {
      type: 'stripe',
      ...data,
    });
  }

  private async runJob(job: Job<ProvisionJobData>): Promise<void> {
    const d = job.data;
    try {
      await this.provisioning.provisionForSubscription(
        d.subscriptionId,
        { domain: d.domain, preferredRegion: d.preferredRegion },
        d.userId,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (d.type === 'wallet') {
        const amount = new Prisma.Decimal(d.refundAmount);
        await this.walletLedger.credit({
          userId: d.userId,
          type: WalletTxType.REFUND,
          amount,
          description: `Auto-refund: provisioning failed for ${d.subscriptionId}`,
          idempotencyKey: `sub-${d.subscriptionId}-initial-refund`,
          subscriptionId: d.subscriptionId,
        });
        await this.prisma.subscription.update({
          where: { id: d.subscriptionId },
          data: { status: SubscriptionStatus.PENDING_PAYMENT },
        });
        this.logger.error(`Wallet provision failed for sub=${d.subscriptionId}: ${msg}`);
      } else if (d.type === 'stripe') {
        this.logger.error(`Stripe provision failed for sub=${d.subscriptionId}: ${msg}`);
        await this.audit.record({
          action: 'SUBSCRIPTION_PROVISIONING_FAILED',
          userId: d.userId,
          details: {
            subscriptionId: d.subscriptionId,
            stripeSubscriptionId: d.stripeSubscriptionId,
            error: msg,
          },
        });
      } else {
        this.logger.error(`Manual provision failed for sub=${d.subscriptionId}: ${msg}`);
        await this.prisma.subscriptionEvent.create({
          data: {
            subscriptionId: d.subscriptionId,
            type: 'PROVISIONING_FAILED',
            details: { source: 'MANUAL', error: msg },
          },
        });
      }
      throw err;
    }
  }
}
