import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MarketingPreferences, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RodoActions } from '../common/audit/audit.actions';

export interface UpdatePreferencesInput {
  marketingEmail?: boolean;
  productUpdatesEmail?: boolean;
  partnerOffersEmail?: boolean;
  loginAlertsEmail?: boolean;
}

/**
 * Per-user marketing/communication opt-in preferences.
 *
 * Transactional and security e-mails are NOT controlled here — they're a
 * contract performance basis (Art. 6(1)(b)) and always sent while the account
 * is active.
 *
 * Each row has an `unsubscribeToken` consumed by `GET /unsubscribe?token=...`
 * for one-click opt-out (RFC 8058 List-Unsubscribe).
 */
@Injectable()
export class MarketingPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Idempotent get-or-create. Called from settings page and from
   * `AuthService.register` (with `marketingEmail` initial value).
   */
  async ensure(userId: string, initial?: UpdatePreferencesInput): Promise<MarketingPreferences> {
    return this.prisma.marketingPreferences.upsert({
      where: { userId },
      create: {
        userId,
        marketingEmail: initial?.marketingEmail ?? false,
        productUpdatesEmail: initial?.productUpdatesEmail ?? false,
        partnerOffersEmail: initial?.partnerOffersEmail ?? false,
        loginAlertsEmail: initial?.loginAlertsEmail ?? true,
        unsubscribeToken: this.makeToken(),
      },
      update: {},
    });
  }

  /**
   * Variant used inside an existing transaction (registration flow).
   */
  async ensureTx(
    tx: Prisma.TransactionClient,
    userId: string,
    initial?: UpdatePreferencesInput,
  ): Promise<MarketingPreferences> {
    return tx.marketingPreferences.upsert({
      where: { userId },
      create: {
        userId,
        marketingEmail: initial?.marketingEmail ?? false,
        productUpdatesEmail: initial?.productUpdatesEmail ?? false,
        partnerOffersEmail: initial?.partnerOffersEmail ?? false,
        loginAlertsEmail: initial?.loginAlertsEmail ?? true,
        unsubscribeToken: this.makeToken(),
      },
      update: {},
    });
  }

  async get(userId: string): Promise<MarketingPreferences> {
    return this.ensure(userId);
  }

  async update(
    userId: string,
    input: UpdatePreferencesInput,
    ctx: { ipAddress?: string | null; userAgent?: string | null } = {},
  ): Promise<MarketingPreferences> {
    const before = await this.ensure(userId);
    const updated = await this.prisma.marketingPreferences.update({
      where: { userId },
      data: input,
    });

    // Audit only if the marketingEmail flag flipped — that's the
    // RODO-relevant signal.
    if (
      input.marketingEmail !== undefined &&
      before.marketingEmail !== updated.marketingEmail
    ) {
      await this.audit.record({
        action: updated.marketingEmail
          ? RodoActions.MARKETING_OPT_IN
          : RodoActions.MARKETING_OPT_OUT,
        userId,
        details: {
          marketingEmail: updated.marketingEmail,
          productUpdatesEmail: updated.productUpdatesEmail,
          partnerOffersEmail: updated.partnerOffersEmail,
        },
        ipAddress: ctx.ipAddress ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
      });
    }
    return updated;
  }

  /**
   * One-click unsubscribe via List-Unsubscribe header (RFC 8058). Token is
   * shared across categories — opt-out kills `marketingEmail`,
   * `productUpdatesEmail` and `partnerOffersEmail` in one shot.
   */
  async oneClickUnsubscribe(
    token: string,
    ctx: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{ userEmail: string }> {
    const row = await this.prisma.marketingPreferences.findUnique({
      where: { unsubscribeToken: token },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!row || !row.user) {
      throw new NotFoundException('Token wypisania jest nieprawidłowy lub wygasł.');
    }
    if (row.marketingEmail || row.productUpdatesEmail || row.partnerOffersEmail) {
      await this.prisma.marketingPreferences.update({
        where: { userId: row.userId },
        data: {
          marketingEmail: false,
          productUpdatesEmail: false,
          partnerOffersEmail: false,
        },
      });
      await this.audit.record({
        action: RodoActions.MARKETING_OPT_OUT,
        userId: row.userId,
        details: { source: 'one_click_unsubscribe' },
        ipAddress: ctx.ipAddress ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
      });
    }
    return { userEmail: row.user.email };
  }

  private makeToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
