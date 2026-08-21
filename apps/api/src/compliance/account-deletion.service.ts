import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AccountStatus, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RodoActions } from '../common/audit/audit.actions';
import { DirectAdminService } from '../servers/directadmin.service';
import { MailerService } from '../mail/mailer.service';
import { ConfigService } from '@nestjs/config';
import {
  deletionRequestedTemplate,
  accountAnonymizedTemplate,
} from '../mail/templates/account-deletion-notifications';

export interface RequestDeletionInput {
  userId: string;
  password: string;
  reason?: string;
  ctx?: { ipAddress?: string | null; userAgent?: string | null };
}

const GRACE_PERIOD_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Hold the DA account in SUSPENDED state for this long after anonymization
 *  so support can recover data in case of a mistake. After this window the
 *  DA account and all its data are deleted permanently. */
const DA_PURGE_AFTER_DAYS = 30;

/**
 * GDPR Art. 17 — right to be forgotten (Sprint 1, L-07).
 *
 * Lifecycle:
 *  1. User submits modal with password → `request()`. Row created with
 *     `scheduledFor = now + 14d`. Account flagged `deletionRequestedAt` for
 *     read-only banner in UI. Confirmation email is sent to the user.
 *  2. User can `cancel()` any time before `scheduledFor`. Row stays for audit.
 *  3. Otherwise, `AccountDeletionScheduler` (cron daily) calls
 *     `executeAnonymization()` for due rows.
 *  4. Anonymization (immediate side-effects):
 *      a. cancel Stripe subscriptions in DB (provider-side cancel handled by
 *         a dedicated sweeper),
 *      b. **suspend DA accounts on the hosting servers via DirectAdmin** so
 *         the still-living account can no longer serve traffic (best-effort,
 *         logged but not fatal — DB is the source of truth),
 *      c. nullify PII columns on `User`, set `User.anonymizedAt`,
 *      d. delete payment methods, wallet auto top-up, etc.,
 *      e. send a final "konto zanonimizowane" email to the user (last contact
 *         before they lose the ability to reach our system).
 *  5. **DA hard-purge** runs 30 days after anonymization (`purgeDueDaAccounts`
 *     called by `AccountDeletionScheduler`). At that point we call DirectAdmin
 *     `CMD_API_SELECT_USERS delete=yes`, which removes the home directory,
 *     databases, mail, FTP and DNS for that account. Account row in DB is
 *     marked `status = DELETED` and detached from the (anonymized) user.
 *
 * Invoice/wallet/subscription rows are kept (5y PL accounting law) but with
 * `userId` pointing to a now-anonymized `User` row.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly da: DirectAdminService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Status read
  // ---------------------------------------------------------------------------

  async getStatusForUser(userId: string) {
    const row = await this.prisma.accountDeletionRequest.findUnique({
      where: { userId },
    });
    if (!row) return { active: false as const };
    return {
      active: !row.cancelledAt && !row.anonymizedAt,
      requestedAt: row.requestedAt.toISOString(),
      scheduledFor: row.scheduledFor.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      anonymizedAt: row.anonymizedAt?.toISOString() ?? null,
      reason: row.reason,
    };
  }

  // ---------------------------------------------------------------------------
  // Request
  // ---------------------------------------------------------------------------

  async request(input: RequestDeletionInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, passwordHash: true, anonymizedAt: true },
    });
    if (!user) throw new NotFoundException('Konto nie istnieje');
    if (user.anonymizedAt) {
      throw new ConflictException('Konto zostało już zanonimizowane.');
    }

    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new ForbiddenException('Nieprawidłowe hasło — usunięcie konta wymaga potwierdzenia hasłem.');
    }

    const existing = await this.prisma.accountDeletionRequest.findUnique({
      where: { userId: input.userId },
    });
    if (existing && !existing.cancelledAt && !existing.anonymizedAt) {
      throw new ConflictException(
        'Wniosek o usunięcie konta jest już aktywny. Możesz go anulować w ustawieniach.',
      );
    }

    const now = new Date();
    const scheduledFor = await this.computeScheduledFor(input.userId, now);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.accountDeletionRequest.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          requestedAt: now,
          scheduledFor,
          reason: input.reason ?? null,
        },
        update: {
          requestedAt: now,
          scheduledFor,
          cancelledAt: null,
          anonymizedAt: null,
          anonymizedById: null,
          reason: input.reason ?? null,
        },
      });
      await tx.user.update({
        where: { id: input.userId },
        data: { deletionRequestedAt: now },
      });
      return created;
    });

    await this.audit.record({
      action: RodoActions.ACCOUNT_DELETION_REQUESTED,
      userId: input.userId,
      actorUserId: input.userId,
      details: {
        scheduledFor: scheduledFor.toISOString(),
        reason: input.reason ?? null,
      },
      ipAddress: input.ctx?.ipAddress ?? undefined,
      userAgent: input.ctx?.userAgent ?? undefined,
    });

    // Send confirmation email with cancel link and effective date. Best-effort
    // — DB row is already created so the request is durable even if SMTP is
    // down.
    void this.notifyDeletionRequested(input.userId, row.scheduledFor).catch((err) => {
      this.logger.warn(
        `notifyDeletionRequested failed for userId=${input.userId}: ${(err as Error).message}`,
      );
    });

    return {
      requestedAt: row.requestedAt.toISOString(),
      scheduledFor: row.scheduledFor.toISOString(),
      gracePeriodDays: GRACE_PERIOD_DAYS,
    };
  }

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  async cancel(userId: string, ctx?: { ipAddress?: string | null; userAgent?: string | null }) {
    const row = await this.prisma.accountDeletionRequest.findUnique({
      where: { userId },
    });
    if (!row || row.cancelledAt) {
      throw new BadRequestException('Brak aktywnego wniosku o usunięcie konta.');
    }
    if (row.anonymizedAt) {
      throw new ConflictException('Konto zostało już zanonimizowane — nie można cofnąć.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.accountDeletionRequest.update({
        where: { userId },
        data: { cancelledAt: now },
      });
      await tx.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: null },
      });
    });

    await this.audit.record({
      action: RodoActions.ACCOUNT_DELETION_CANCELLED,
      userId,
      actorUserId: userId,
      ipAddress: ctx?.ipAddress ?? undefined,
      userAgent: ctx?.userAgent ?? undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // Background anonymization (called by scheduler & admin force action)
  // ---------------------------------------------------------------------------

  async listDue(now = new Date()): Promise<string[]> {
    const rows = await this.prisma.accountDeletionRequest.findMany({
      where: {
        anonymizedAt: null,
        cancelledAt: null,
        scheduledFor: { lte: now },
      },
      select: { userId: true },
      take: 50,
    });
    return rows.map((r) => r.userId);
  }

  /**
   * Performs the anonymization. Should be called inside the scheduler or by
   * the admin panel "force anonymize" button.
   *
   * `actorUserId = null` for cron path, set when admin forces it.
   */
  async executeAnonymization(userId: string, actorUserId: string | null = null): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, anonymizedAt: true, email: true, firstName: true },
    });
    if (!user) return;
    if (user.anonymizedAt) {
      this.logger.debug(`User ${userId} already anonymized — skipping`);
      return;
    }

    // Capture the original email BEFORE the transaction so we can send a
    // final notification once the DB work is committed.
    const originalEmail = user.email;
    const originalFirstName = user.firstName;

    // Best-effort: cancel Stripe subscriptions in DB (provider-side cancel
    // happens via separate cron sweeping CANCELED rows; we don't block
    // anonymization on Stripe API availability).
    const subs = await this.prisma.subscription.findMany({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.PROVISIONING] } },
    });

    // Snapshot live DA accounts BEFORE anonymizing. We need their server +
    // username to issue suspend calls AFTER the DB transaction commits.
    const liveAccounts = await this.prisma.account.findMany({
      where: { userId, status: { in: [AccountStatus.ACTIVE, AccountStatus.PROVISIONING] } },
      select: { id: true, daUsername: true, serverId: true },
    });

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // 1) Mark subscriptions as canceled — actual Stripe cancel is handled by
      //    a separate sweeper; keeping `stripeSubscriptionId` so the sweeper
      //    knows which to cancel provider-side.
      for (const sub of subs) {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: SubscriptionStatus.CANCELED,
            canceledAt: now,
            cancelAt: now,
          },
        });
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            type: 'CANCELED',
            details: { source: 'ACCOUNT_ANONYMIZATION' },
          },
        });
      }

      // 2) Mark all DA accounts as SUSPENDED in DB. Provider-side suspend
      //    follows after the transaction commits so we don't hold a DB
      //    transaction open while waiting for HTTP. If DA happens to be
      //    unreachable, our DB still reflects "service no longer authorized"
      //    and the operator gets a warning in logs to follow up.
      await tx.account.updateMany({
        where: { userId, status: { in: [AccountStatus.ACTIVE, AccountStatus.PROVISIONING] } },
        data: { status: AccountStatus.SUSPENDED },
      });

      // 3) Anonymize user PII. Email is replaced by a stable synthetic value
      //    (so foreign keys remain), other PII is nullified or zeroed.
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@verris.local`,
          firstName: null,
          lastName: null,
          companyName: null,
          nip: null,
          address: null,
          city: null,
          postalCode: null,
          country: null,
          passwordHash: '',
          twoFactorSecret: null,
          isTwoFactorEnabled: false,
          twoFactorEnrolledAt: null,
          twoFactorRecoveryCodesEnc: null,
          referralCode: null,
          ecoBadgeToken: null,
          stripeCustomerId: null,
          defaultPaymentMethodId: null,
          deletionRequestedAt: null,
          anonymizedAt: now,
        },
      });

      // 4) Wipe payment methods (raw card brand/last4 alone is PII when tied
      //    to identity).
      await tx.paymentMethod.deleteMany({ where: { userId } });

      // 5) Wipe wallet auto top-up (no need to keep, contains last error msg).
      await tx.walletAutoTopup.deleteMany({ where: { userId } });

      // 6) Mark deletion request done.
      await tx.accountDeletionRequest.update({
        where: { userId },
        data: {
          anonymizedAt: now,
          anonymizedById: actorUserId,
        },
      });
    });

    // 7) Provider-side DA suspend (after commit). One failure must not block
    //    others — log and continue. The `purgeDueDaAccounts` sweeper will
    //    re-attempt suspended-but-still-active accounts during the 30 day
    //    window if needed.
    for (const acc of liveAccounts) {
      await this.suspendOnDaSafely(acc);
    }

    await this.audit.record({
      action: actorUserId
        ? RodoActions.ADMIN_FORCED_ACCOUNT_ANONYMIZED
        : RodoActions.ACCOUNT_ANONYMIZED,
      userId,
      actorUserId,
      details: {
        previousEmail: originalEmail,
        canceledSubs: subs.length,
        suspendedDaAccounts: liveAccounts.length,
      },
    });

    // 8) Final goodbye email to the original address — last contact before
    //    we lose the ability to reach the data subject.
    void this.notifyAccountAnonymized({
      to: originalEmail,
      firstName: originalFirstName,
      purgeDate: new Date(now.getTime() + DA_PURGE_AFTER_DAYS * MS_PER_DAY),
    }).catch((err) => {
      this.logger.warn(
        `notifyAccountAnonymized failed for userId=${userId}: ${(err as Error).message}`,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // DA hard-purge (called by AccountDeletionScheduler 30 days after anon)
  // ---------------------------------------------------------------------------

  /**
   * Returns Account IDs whose owning user has been anonymized for more than
   * `DA_PURGE_AFTER_DAYS`, and whose DA-side data hasn't been purged yet.
   * Up to `take` rows per call.
   */
  async listAccountsDueForDaPurge(now = new Date(), take = 50): Promise<string[]> {
    const cutoff = new Date(now.getTime() - DA_PURGE_AFTER_DAYS * MS_PER_DAY);
    const rows = await this.prisma.account.findMany({
      where: {
        status: { not: AccountStatus.DELETED },
        user: { anonymizedAt: { lte: cutoff } },
      },
      select: { id: true },
      take,
    });
    return rows.map((r) => r.id);
  }

  /**
   * Issues `CMD_API_SELECT_USERS delete=yes` on DirectAdmin for the account
   * and marks the row `status = DELETED`. Idempotent: if DA returns "user
   * not found", we still mark the DB row as DELETED.
   */
  async purgeAccountOnDa(accountId: string): Promise<void> {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, daUsername: true, serverId: true, status: true, userId: true },
    });
    if (!acc) return;
    if (acc.status === AccountStatus.DELETED) return;

    let daResult: { ok: boolean; error?: string } = { ok: true };
    try {
      const client = await this.da.getClientForServer(acc.serverId);
      await client.deleteAccount(acc.daUsername);
    } catch (err) {
      const msg = (err as Error).message;
      // "user not found" is acceptable — proceed with DB-side mark.
      const benign = /not\s*found|does\s*not\s*exist|brak/i.test(msg);
      if (!benign) {
        this.logger.error(
          `DA delete failed for accountId=${accountId} (daUsername=${acc.daUsername}): ${msg}`,
        );
        daResult = { ok: false, error: msg.slice(0, 500) };
      } else {
        this.logger.warn(
          `DA delete: user already gone for accountId=${accountId} — proceeding with DB mark`,
        );
      }
    }

    if (!daResult.ok) {
      // Don't mark DELETED — let the scheduler retry next tick.
      return;
    }

    await this.prisma.account.update({
      where: { id: accountId },
      data: { status: AccountStatus.DELETED },
    });
    await this.audit.record({
      action: RodoActions.ACCOUNT_DA_PURGED,
      userId: acc.userId,
      details: { accountId, daUsername: acc.daUsername, serverId: acc.serverId },
    });
  }

  // ---------------------------------------------------------------------------
  // DA helpers + email notifications
  // ---------------------------------------------------------------------------

  private async suspendOnDaSafely(acc: { id: string; daUsername: string; serverId: string }): Promise<void> {
    try {
      const client = await this.da.getClientForServer(acc.serverId);
      await client.suspendAccount(acc.daUsername);
    } catch (err) {
      this.logger.warn(
        `DA suspend failed for accountId=${acc.id} (daUsername=${acc.daUsername}): ${(err as Error).message}. ` +
          `DB row remains SUSPENDED; scheduler will retry during the 30-day purge window.`,
      );
    }
  }

  private async notifyDeletionRequested(userId: string, scheduledFor: Date): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!user) return;
    const panelUrl = this.resolvePanelUrl();
    const message = deletionRequestedTemplate({
      to: user.email,
      firstName: user.firstName,
      scheduledFor,
      gracePeriodDays: GRACE_PERIOD_DAYS,
      cancelUrl: `${panelUrl}/dashboard/settings?tab=privacy`,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'RODO' });
  }

  private async notifyAccountAnonymized(opts: {
    to: string;
    firstName: string | null;
    purgeDate: Date;
  }): Promise<void> {
    if (!opts.to || opts.to.endsWith('@verris.local')) {
      // Account was already anonymized once or has no resolvable email.
      return;
    }
    const message = accountAnonymizedTemplate({
      to: opts.to,
      firstName: opts.firstName,
      purgeDate: opts.purgeDate,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'RODO' });
  }

  private resolvePanelUrl(): string {
    return (
      this.config.get<string>('CLIENT_PANEL_URL') ??
      this.config.get<string>('clientPanelUrl') ??
      'https://panel.verris.pl'
    );
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * `requestedAt + 14d`, but clamped to the *end* of the longest active Stripe
   * billing cycle so we don't anonymize mid-cycle (final invoice still needs
   * to be issued under the user's name for accounting).
   */
  private async computeScheduledFor(userId: string, now: Date): Promise<Date> {
    const baseline = new Date(now.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY);
    const longestPeriod = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        currentPeriodEnd: { not: null },
      },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { currentPeriodEnd: true },
    });
    if (longestPeriod?.currentPeriodEnd && longestPeriod.currentPeriodEnd > baseline) {
      // Anonymize 1 day after billing cycle end so the renewal/final-invoice
      // event has time to settle.
      return new Date(longestPeriod.currentPeriodEnd.getTime() + MS_PER_DAY);
    }
    return baseline;
  }
}
