import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus, WalletTxType } from '@verris/database';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { AuditService } from '../common/audit/audit.service';
import { ProvisioningActions } from '../common/audit/audit.actions';
import { ProvisioningService } from './provisioning.service';
import { BladEtapuProvisioningu } from './provisioning-error';
import { PromoService } from '../billing/promo.service';

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
const MAX_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 5_000;

/** Sprint 5 / R-11+B-7 — etapy widoczne klientowi (string żeby uniknąć migracji enum). */
export const ProvisioningStage = {
  QUEUED: 'queued',
  RUNNING: 'running',
  RETRYING: 'retrying',
  FAILED: 'failed',
  COMPLETED: 'completed',
} as const;

export type ProvisioningStageValue =
  (typeof ProvisioningStage)[keyof typeof ProvisioningStage];

@Injectable()
export class ProvisioningQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProvisioningQueueService.name);
  private connection: IORedis | null = null;
  private queue: Queue<ProvisionJobData> | null = null;
  private worker: Worker<ProvisionJobData> | null = null;
  private events: QueueEvents | null = null;

  /** Sprint 5: lekki licznik dla `verris_provisioning_jobs_total{result=...}`. */
  private readonly counters = {
    started: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    queued: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly walletLedger: WalletLedgerService,
    private readonly audit: AuditService,
    private readonly promo: PromoService,
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
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
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

    this.events = new QueueEvents(QUEUE_NAME, { connection: this.connection.duplicate() });

    this.worker.on('failed', (job, err) => {
      this.counters.failed += 1;
      this.logger.error(
        `Provisioning job failed id=${job?.id} name=${job?.name}: ${err instanceof Error ? err.message : err}`,
      );
    });
    this.worker.on('active', (job) => {
      this.counters.started += 1;
      this.logger.debug(`Provisioning job started id=${job.id} attempts=${job.attemptsMade}`);
    });
    this.worker.on('completed', () => {
      this.counters.completed += 1;
    });

    this.logger.log(
      `BullMQ provisioning worker started (REDIS_URL set, max ${MAX_ATTEMPTS} attempts).`,
    );
  }

  async onModuleDestroy() {
    await this.events?.close();
    await this.worker?.close();
    await this.queue?.close();
    if (this.connection) {
      await this.connection.quit();
    }
  }

  // ---------------------------------------------------------------------------
  // Enqueue API (idempotent: jobId == subscriptionId, więc duplikaty są łapane)
  // ---------------------------------------------------------------------------

  async enqueueWalletProvision(data: {
    subscriptionId: string;
    userId: string;
    domain: string;
    preferredRegion: string | null;
    refundAmount: Prisma.Decimal;
  }): Promise<void> {
    if (!this.queue) throw new Error('Provisioning queue not initialized');
    await this.queue.add(
      'wallet',
      {
        type: 'wallet',
        subscriptionId: data.subscriptionId,
        userId: data.userId,
        domain: data.domain,
        preferredRegion: data.preferredRegion,
        refundAmount: data.refundAmount.toString(),
      },
      { jobId: `wallet-${data.subscriptionId}` },
    );
    await this.markQueued(data.subscriptionId);
    await this.recordQueueAudit(ProvisioningActions.PROVISIONING_JOB_QUEUED, data.userId, {
      subscriptionId: data.subscriptionId,
      source: 'wallet',
      jobId: `wallet-${data.subscriptionId}`,
    });
  }

  async enqueueManualProvision(data: {
    subscriptionId: string;
    userId: string;
    domain: string;
    preferredRegion: string | null;
  }): Promise<void> {
    if (!this.queue) throw new Error('Provisioning queue not initialized');
    await this.queue.add(
      'manual',
      { type: 'manual', ...data },
      { jobId: `manual-${data.subscriptionId}` },
    );
    await this.markQueued(data.subscriptionId);
    await this.recordQueueAudit(ProvisioningActions.PROVISIONING_JOB_QUEUED, data.userId, {
      subscriptionId: data.subscriptionId,
      source: 'manual',
      jobId: `manual-${data.subscriptionId}`,
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
    await this.queue.add(
      'stripe',
      { type: 'stripe', ...data },
      { jobId: `stripe-${data.subscriptionId}` },
    );
    await this.markQueued(data.subscriptionId);
    await this.recordQueueAudit(ProvisioningActions.PROVISIONING_JOB_QUEUED, data.userId, {
      subscriptionId: data.subscriptionId,
      source: 'stripe',
      jobId: `stripe-${data.subscriptionId}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Sprint 5 — admin operations
  // ---------------------------------------------------------------------------

  async listJobs(opts: { state?: 'failed' | 'completed' | 'active' | 'waiting' | 'delayed' } = {}) {
    if (!this.queue) return { rows: [], counts: {} };
    const states = opts.state
      ? [opts.state]
      : (['active', 'waiting', 'delayed', 'failed', 'completed'] as const);
    const counts = await this.queue.getJobCounts(...states);
    const jobs: Job<ProvisionJobData>[] = [];
    for (const state of states) {
      const list = await this.queue.getJobs([state], 0, 50, false);
      jobs.push(...list);
    }
    jobs.sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0));
    const rows = await Promise.all(
      jobs.slice(0, 100).map(async (job) => {
        const state = await job.getState();
        const sub = await this.prisma.subscription.findUnique({
          where: { id: job.data.subscriptionId },
          select: {
            status: true,
            provisioningStage: true,
            provisioningAttempts: true,
            provisioningLastError: true,
            user: { select: { email: true, firstName: true, lastName: true } },
            account: { select: { id: true, daUsername: true, serverId: true } },
          },
        });
        return {
          id: job.id,
          name: job.name,
          state,
          timestamp: job.timestamp,
          attemptsMade: job.attemptsMade,
          finishedOn: job.finishedOn ?? null,
          processedOn: job.processedOn ?? null,
          failedReason: job.failedReason ?? null,
          failedCategory: job.failedReason ? categorizeProvisioningError(job.failedReason) : null,
          data: job.data,
          subscription: sub
            ? {
                status: sub.status,
                provisioningStage: sub.provisioningStage,
                provisioningAttempts: sub.provisioningAttempts,
                provisioningLastError: sub.provisioningLastError,
                user: sub.user,
                account: sub.account,
              }
            : null,
        };
      }),
    );
    return {
      counts,
      rows,
    };
  }

  async retryJob(
    jobId: string,
    opts: { actorUserId?: string | null; reason?: string | null } = {},
  ): Promise<{ ok: boolean }> {
    if (!this.queue) throw new Error('Queue not initialized');
    const job = await this.queue.getJob(jobId);
    if (!job) return { ok: false };
    await job.retry();
    this.counters.retried += 1;
    await this.markQueued(job.data.subscriptionId);
    await this.audit.record({
      action: ProvisioningActions.PROVISIONING_JOB_RETRIED_BY_ADMIN,
      userId: job.data.userId,
      actorUserId: opts.actorUserId ?? null,
      details: {
        subscriptionId: job.data.subscriptionId,
        jobId,
        reason: opts.reason ?? null,
        previousFailedReason: job.failedReason ?? null,
      },
    });
    return { ok: true };
  }

  /**
   * X-32 — odrzucenie martwego joba.
   *
   * Alarm `VerrisProvisioningQueueFailed` mówi „posprzątaj kolejkę", a do
   * 2026-08-23 nie było czym: panel miał wyłącznie „Retry", a retry przy
   * nieosiągalnym węźle tylko podbija licznik prób. Zostawało grzebanie
   * w Redisie ręcznie — czyli zmiana stanu produkcyjnego BEZ ŚLADU.
   *
   * TYLKO STAN `failed`. Usunięcie joba aktywnego albo czekającego osierociłoby
   * provisioning w trakcie: konto na węźle mogłoby powstać, a system przestałby
   * o nim wiedzieć. Ta jedna linia jest tu najważniejsza.
   *
   * NAJPIERW ODCZYT, POTEM USUNIĘCIE. Po `job.remove()` nie ma już czego
   * zapisać, a wpis w audycie bez `failedReason` byłby wart tyle co nic —
   * zwłaszcza teraz, gdy po `Z-18` ten błąd niesie prawdziwą przyczynę.
   *
   * SUBSKRYPCJI NIE RUSZAMY. Odrzucenie sprząta kolejkę i tyle. Los zamówienia
   * to osobna decyzja i nie chcę, żeby jeden przycisk robił obie rzeczy.
   */
  async odrzucJob(
    jobId: string,
    opts: { actorUserId?: string | null; reason: string },
  ): Promise<{ ok: boolean; powod?: string }> {
    if (!this.queue) throw new Error('Queue not initialized');
    const job = await this.queue.getJob(jobId);
    if (!job) return { ok: false, powod: 'Job nie istnieje.' };

    const stan = await job.getState();
    if (stan !== 'failed') {
      return {
        ok: false,
        powod:
          `Odrzucić można tylko joba w stanie "failed" — ten jest w stanie "${stan}". ` +
          'Usunięcie joba w trakcie osierociłoby provisioning na węźle.',
      };
    }

    const slad = {
      subscriptionId: job.data.subscriptionId,
      jobId,
      typ: job.data.type,
      attemptsMade: job.attemptsMade ?? 0,
      failedReason: job.failedReason ?? null,
      reason: opts.reason,
    };

    await job.remove();

    await this.audit.record({
      action: ProvisioningActions.PROVISIONING_JOB_DISCARDED_BY_ADMIN,
      userId: job.data.userId,
      actorUserId: opts.actorUserId ?? null,
      details: slad,
    });
    this.logger.warn(
      `Provisioning job ${jobId} odrzucony przez operatora (sub=${slad.subscriptionId}, ` +
        `prób=${slad.attemptsMade}, powód="${opts.reason}")`,
    );
    return { ok: true };
  }

  /**
   * Sprint 5 — counters dla `MetricsService`. BullMQ trzyma counts w Redis,
   * ale dorzucamy też nasze własne counter-y które dorobimy do /metrics.
   */
  async getQueueMetrics(): Promise<{
    counts: Record<string, number>;
    process: { started: number; completed: number; failed: number; retried: number; queued: number };
    oldestWaitingAgeSeconds: number;
  }> {
    if (!this.queue) {
      return { counts: {}, process: this.counters, oldestWaitingAgeSeconds: 0 };
    }
    // bullmq 6 usunęło 'paused' z JobType — wstrzymanie kolejki jest teraz
    // stanem KOLEJKI, nie zadania, i czyta się je przez isPaused().
    const counts = await this.queue.getJobCounts(
      'active',
      'waiting',
      'delayed',
      'failed',
      'completed',
    );
    const waiting = await this.queue.getJobs(['waiting', 'delayed'], 0, 0, true);
    const oldest = waiting[0];
    const oldestWaitingAgeSeconds = oldest?.timestamp
      ? Math.max(0, Math.floor((Date.now() - oldest.timestamp) / 1000))
      : 0;
    return { counts, process: this.counters, oldestWaitingAgeSeconds };
  }

  // ---------------------------------------------------------------------------
  // Job runner
  // ---------------------------------------------------------------------------

  private async runJob(job: Job<ProvisionJobData>): Promise<void> {
    const d = job.data;
    const isLastAttempt = (job.attemptsMade ?? 0) + 1 >= MAX_ATTEMPTS;

    await this.markStage(d.subscriptionId, ProvisioningStage.RUNNING, {
      attempt: (job.attemptsMade ?? 0) + 1,
    });
    await this.recordQueueAudit(ProvisioningActions.PROVISIONING_JOB_STARTED, d.userId, {
      subscriptionId: d.subscriptionId,
      jobId: String(job.id),
      attempt: (job.attemptsMade ?? 0) + 1,
    });

    try {
      // Sprint 5 — idempotency dla DA: jeśli istnieje już Account dla
      // subskrypcji (poprzednia próba przeszła, ale błąd po stronie pipeline'u
      // lub timeout sieci), nie wołamy DA drugi raz.
      const existing = await this.prisma.account.findUnique({
        where: { subscriptionId: d.subscriptionId },
        select: { id: true },
      });
      if (existing) {
        this.logger.warn(
          `Provisioning sub=${d.subscriptionId} job=${job.id} already has account=${existing.id} — promoting subscription do ACTIVE.`,
        );
        await this.prisma.subscription.update({
          where: { id: d.subscriptionId },
          data: {
            status: SubscriptionStatus.ACTIVE,
          },
        });
        await this.markStage(d.subscriptionId, ProvisioningStage.COMPLETED);
        await this.finalizeServicePromoIfNeeded(d.subscriptionId, d.userId);
        await this.audit.record({
          action: ProvisioningActions.PROVISIONING_JOB_COMPLETED,
          userId: d.userId,
          details: {
            subscriptionId: d.subscriptionId,
            existingAccountId: existing.id,
            jobId: String(job.id),
            recoveredFromPartial: true,
          },
        });
        return;
      }

      await this.provisioning.provisionForSubscription(
        d.subscriptionId,
        { domain: d.domain, preferredRegion: d.preferredRegion },
        d.userId,
      );
      await this.markStage(d.subscriptionId, ProvisioningStage.COMPLETED);
      await this.finalizeServicePromoIfNeeded(d.subscriptionId, d.userId);
      await this.recordQueueAudit(ProvisioningActions.PROVISIONING_JOB_COMPLETED, d.userId, {
        subscriptionId: d.subscriptionId,
        jobId: String(job.id),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Z-18 — klasyfikujemy OBIEKT, nie napis. `msg` jest komunikatem dla
      // człowieka; `przyczyna` to oryginalna treść błędu, po której naprawdę
      // wiadomo, czy warto ponowić.
      const przyczyna = err instanceof BladEtapuProvisioningu ? err.przyczyna : msg;
      const errCategory = kategoriaBledu(err);

      if (!isLastAttempt && errCategory === 'transient') {
        await this.markStage(d.subscriptionId, ProvisioningStage.RETRYING, {
          error: msg,
          attempt: (job.attemptsMade ?? 0) + 1,
        });
        await this.audit.record({
          action: ProvisioningActions.PROVISIONING_JOB_RETRYING,
          userId: d.userId,
          details: {
            subscriptionId: d.subscriptionId,
            jobId: String(job.id),
            attempt: (job.attemptsMade ?? 0) + 1,
            error: msg,
            przyczyna,
            category: errCategory,
          },
        });
        throw err;
      }

      await this.markStage(d.subscriptionId, ProvisioningStage.FAILED, {
        error: msg,
        attempt: (job.attemptsMade ?? 0) + 1,
      });
      await this.recordQueueAudit(ProvisioningActions.PROVISIONING_JOB_FAILED, d.userId, {
        subscriptionId: d.subscriptionId,
        jobId: String(job.id),
        attempt: (job.attemptsMade ?? 0) + 1,
        error: msg,
        przyczyna,
        category: errCategory,
      });

      // Hard fail — handle wallet refund / event log per source.
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
            category: errCategory,
          },
        });
      } else {
        this.logger.error(`Manual provision failed for sub=${d.subscriptionId}: ${msg}`);
        await this.prisma.subscriptionEvent.create({
          data: {
            subscriptionId: d.subscriptionId,
            type: 'PROVISIONING_FAILED',
            details: { source: 'MANUAL', error: msg, category: errCategory },
          },
        });
      }
      throw err;
    }
  }

  private async markQueued(subscriptionId: string): Promise<void> {
    this.counters.queued += 1;
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        provisioningStage: ProvisioningStage.QUEUED,
        provisioningStartedAt: null,
        provisioningCompletedAt: null,
        provisioningLastError: null,
      },
    });
  }

  private async markStage(
    subscriptionId: string,
    stage: ProvisioningStageValue,
    extra: { error?: string; attempt?: number } = {},
  ): Promise<void> {
    const data: Prisma.SubscriptionUpdateInput = {
      provisioningStage: stage,
    };
    if (stage === ProvisioningStage.RUNNING) {
      data.provisioningStartedAt = new Date();
      data.provisioningLastError = null;
      if (extra.attempt) {
        data.provisioningAttempts = extra.attempt;
      }
    }
    if (stage === ProvisioningStage.RETRYING || stage === ProvisioningStage.FAILED) {
      data.provisioningLastError = extra.error ?? null;
      if (extra.attempt) {
        data.provisioningAttempts = extra.attempt;
      }
    }
    if (stage === ProvisioningStage.COMPLETED) {
      data.provisioningCompletedAt = new Date();
      data.provisioningLastError = null;
    }
    try {
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to mark provisioning stage=${stage} for sub=${subscriptionId}: ${(err as Error).message}`,
      );
    }
  }

  private async finalizeServicePromoIfNeeded(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        appliedPromoCodeId: true,
        listPriceAmount: true,
        priceAmount: true,
      },
    });
    if (!sub?.appliedPromoCodeId) return;
    const listPrice = sub.listPriceAmount ?? sub.priceAmount;
    await this.promo.recordServicePromoRedemption({
      userId,
      promoCodeId: sub.appliedPromoCodeId,
      subscriptionId,
      listPrice,
      chargedAmount: sub.priceAmount,
    });
  }

  private async recordQueueAudit(
    action: string,
    userId: string,
    details: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.audit.record({ action, userId, details });
  }
}

/**
 * Klasyfikacja błędów DA/sieci pod retry.
 *  - `transient`: timeout, ECONNREFUSED, ECONNRESET, 5xx z DA, „node at capacity"
 *  - `permanent`: 4xx z DA poza 408/429, „domain already exists", validation
 */
export function categorizeProvisioningError(msg: string): 'transient' | 'permanent' {
  const lower = msg.toLowerCase();
  if (
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('socket hang up') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('all compute nodes are at capacity') ||
    lower.includes('cloudlinux lve limits could not be applied')
  ) {
    return 'transient';
  }
  return 'permanent';
}

/**
 * Z-18 — klasyfikacja BŁĘDU, nie jego prozy.
 *
 * `categorizeProvisioningError` czyta napis i jest napisana poprawnie: ma
 * `econnrefused` na liście błędów przejściowych. Problem polegał na tym, czym
 * ją karmiono. Etapy provisioningu łapały prawdziwy błąd i rzucały dalej stały
 * komunikat dla człowieka, więc klasyfikator dostawał tekst, w którym słowa
 * „ECONNREFUSED" nie było — i zwracał `permanent`. Zerwanie sieci uruchamiało
 * ścieżkę twardej porażki ze zwrotem środków JUŻ PRZY PIERWSZEJ PRÓBIE, mimo
 * że druga mogła się udać — a wtedy klient miał hosting i zwrot naraz.
 *
 * Ta funkcja pyta więc OBIEKT: `BladEtapuProvisioningu` zna swoją `przyczyna`
 * i to ona idzie do klasyfikacji. Napis zostaje jako ścieżka zapasowa, bo nie
 * każdy błąd przejdzie przez nasze opakowanie — awaria może wyjść z Prismy,
 * z sieci, skądkolwiek.
 *
 * Zwróć uwagę, dlaczego dopasowanie po prozie było kruche niezależnie od tego
 * błędu: jeden z komunikatów („CloudLinux LVE limits could not be applied")
 * trafiał na listę przejściowych DLATEGO, że ktoś dopisał to zdanie do
 * klasyfikatora. Działało, dopóki nikt nie poprawił stylistyki komunikatu.
 * To dziesiąte wystąpienie rodziny „strażnik dopasowuje własną prozę".
 */
export function kategoriaBledu(err: unknown): 'transient' | 'permanent' {
  if (err instanceof BladEtapuProvisioningu) {
    return categorizeProvisioningError(err.przyczyna);
  }
  if (err instanceof Error) {
    return categorizeProvisioningError(err.message);
  }
  return categorizeProvisioningError(String(err));
}
