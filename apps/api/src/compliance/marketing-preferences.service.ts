import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MarketingPreferences, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { RodoActions } from '../common/audit/audit.actions.js';

export interface UpdatePreferencesInput {
  marketingEmail?: boolean;
  productUpdatesEmail?: boolean;
  partnerOffersEmail?: boolean;
  loginAlertsEmail?: boolean;
  autoscalingEmail?: boolean;
  quotaAlertsEmail?: boolean;
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

    // A2-14 (paczka 109) — ślad każdej zgody marketingowej, nie tylko newslettera: „Nowości” (productUpdatesEmail)
    // i „Oferty partnerskie” (partnerOffersEmail) to też zgody na informację handlową (art. 7 ust. 1 RODO — wykazanie
    // zgody). Wcześniej przełączenie tych dwóch nie zostawiało żadnego wpisu.
    const KATEGORIE = ['marketingEmail', 'productUpdatesEmail', 'partnerOffersEmail'] as const;
    for (const kategoria of KATEGORIE) {
      if (input[kategoria] === undefined || before[kategoria] === updated[kategoria]) continue;
      await this.audit.record({
        action: updated[kategoria] ? RodoActions.MARKETING_OPT_IN : RodoActions.MARKETING_OPT_OUT,
        userId,
        details: {
          kategoria,
          zrodlo: 'USTAWIENIA_POWIADOMIENIA',
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
  /** A1-06 — czy link wypisu jest ważny (strona GET, bez zmiany zgód). */
  async tokenWypisuIstnieje(token: string): Promise<boolean> {
    if (!token?.trim()) return false;
    return (await this.prisma.marketingPreferences.count({ where: { unsubscribeToken: token } })) > 0;
  }

  async oneClickUnsubscribe(
    token: string,
    ctx: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{ userEmail: string }> {
    // A1-06 — `findUnique({ unsubscribeToken: undefined })` rzucało wyjątek Prisma (500).
    if (!token?.trim()) throw new BadRequestException('Brak tokenu wypisu – użyj linku z wiadomości.');
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
