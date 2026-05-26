import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ControlPlaneSystemAddressRole,
  EmailCategory,
  EmailStatus,
  Prisma,
} from '@verris/database';
import { MailMessage, MailerProvider } from './mailer.interface';
import { LogMailerProvider } from './log-mailer.provider';
import {
  buildSmtpMailerProvider,
  isLocalSmtpHost,
} from './mail-smtp.factory';
import type { MailSmtpSecure } from './mail-settings.keys';
import { PrismaService } from '../prisma/prisma.service';

export const MAILER_PROVIDER = Symbol('MAILER_PROVIDER');

export interface MailerConfig {
  fromAddress: string;
  fromName: string;
  /** Hard fallback if the active provider throws. We always log to console
   *  on failure even with a real SMTP provider so customers don't get
   *  silently dropped events. */
  swallowErrors: boolean;
}

export interface MailerSendResult {
  providerId: string;
  messageId: string | null;
  /** EmailLog row id (or null jeśli z jakiegoś powodu nie zapisano). */
  emailLogId: string | null;
  /** Czy mail został rzeczywiście wysłany do providera. */
  delivered: boolean;
  /** Powód `delivered=false` (suppressed: opt-out, anonymized, brak adresu). */
  suppressedReason?: 'OPTED_OUT' | 'ANONYMIZED' | 'NO_RECIPIENT';
}

/**
 * Sprint 2.6: thin facade z 3 odpowiedzialnościami:
 *
 *  1. **Opt-out enforcement** — dla `category=MARKETING` sprawdza
 *     `MarketingPreferences` użytkownika. Jeśli user wypisany — zapisuje
 *     EmailLog ze statusem `SUPPRESSED` i wraca bez wywołania providera.
 *
 *  2. **EmailLog persistence** — przed wysyłką tworzy wpis (`QUEUED`),
 *     po wysyłce updatuje na `SENT`/`FAILED` z providerId/messageId.
 *     Każdy mail (transactional + marketing) ma ślad w bazie.
 *
 *  3. **List-Unsubscribe injection** — dla `MARKETING` automatycznie
 *     dokleja header `List-Unsubscribe` (RFC 8058) z URLem do
 *     `GET /unsubscribe?token=...`. Wymóg deliverability dla Gmail/Outlook.
 *
 * Dla TRANSACTIONAL maili pomija opt-out (legal basis: contract performance),
 * ale nadal zapisuje do EmailLog.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @Inject(MAILER_PROVIDER) private readonly provider: MailerProvider,
    @Inject('MAILER_CONFIG') private readonly config: MailerConfig,
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
  ) {
    this.logger.log(`Active provider: ${provider.id}`);
  }

  /**
   * Główne API. Zwraca pełny `MailerSendResult` (delivered + suppressedReason).
   * Stara sygnatura `{ providerId, messageId }` pozostaje kompatybilna —
   * wszystkie istniejące callers nadal kompilują się bez zmian.
   */
  async send(message: MailMessage): Promise<MailerSendResult> {
    if (!message.to) {
      return {
        providerId: this.provider.id,
        messageId: null,
        emailLogId: null,
        delivered: false,
        suppressedReason: 'NO_RECIPIENT',
      };
    }

    const category: EmailCategory =
      (message.category as EmailCategory | undefined) ?? EmailCategory.TRANSACTIONAL;

    // ---- 1. Opt-out / anonymization gate ------------------------------------
    const gate = await this.evaluateGate(message, category);
    if (gate.allowed === false) {
      const log = await this.persistSuppressed(message, category, gate.reason);
      return {
        providerId: this.provider.id,
        messageId: null,
        emailLogId: log?.id ?? null,
        delivered: false,
        suppressedReason: gate.reason,
      };
    }

    const withFrom = await this.applyFromOverrides(message);

    // ---- 2. List-Unsubscribe injection (MARKETING only) --------------------
    const enriched = await this.enrichForCategory(withFrom, category);

    // ---- 3. Pre-write EmailLog (status=QUEUED) -----------------------------
    const log = await this.persistQueued(enriched, category);

    // ---- 4. Provider call --------------------------------------------------
    try {
      const result = await this.provider.send(enriched);
      await this.markSent(log?.id ?? null, result.providerId, result.messageId);
      return {
        providerId: result.providerId,
        messageId: result.messageId,
        emailLogId: log?.id ?? null,
        delivered: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Mailer failed to deliver to ${message.to}: ${msg}`);
      await this.markFailed(log?.id ?? null, msg);
      if (this.config.swallowErrors) {
        return {
          providerId: this.provider.id,
          messageId: null,
          emailLogId: log?.id ?? null,
          delivered: false,
        };
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Gate & enrichment
  // ---------------------------------------------------------------------------

  private async evaluateGate(
    message: MailMessage,
    category: EmailCategory,
  ): Promise<
    | { allowed: true }
    | { allowed: false; reason: 'OPTED_OUT' | 'ANONYMIZED' | 'NO_RECIPIENT' }
  > {
    // 1. user-level resolution. Preferujemy `userId` z message; jeśli brak —
    //    próbujemy znaleźć po emailu (nie nadgorliwie — tylko jeśli unikalny).
    let user: {
      id: string;
      anonymizedAt: Date | null;
      marketingPreferences: {
        marketingEmail: boolean;
        productUpdatesEmail: boolean;
      } | null;
    } | null = null;

    if (message.userId) {
      user = await this.prisma.user.findUnique({
        where: { id: message.userId },
        select: {
          id: true,
          anonymizedAt: true,
          marketingPreferences: {
            select: { marketingEmail: true, productUpdatesEmail: true },
          },
        },
      });
    } else {
      // Best effort — wyszukanie po email. Rzadko używane (większość maili
      // dziś ma userId), ale ułatwia future workflow z guest-emailami.
      user = await this.prisma.user.findUnique({
        where: { email: message.to },
        select: {
          id: true,
          anonymizedAt: true,
          marketingPreferences: {
            select: { marketingEmail: true, productUpdatesEmail: true },
          },
        },
      });
    }

    // 2. Anonymized = nie wysyłamy nic, nawet TRANSACTIONAL (konto martwe).
    if (user && user.anonymizedAt) {
      return { allowed: false, reason: 'ANONYMIZED' };
    }

    // 3. PRODUCT_UPDATE — scale-up / zmiany usługi (opt-out per productUpdatesEmail).
    if (category === 'PRODUCT_UPDATE') {
      if (user?.marketingPreferences && !user.marketingPreferences.productUpdatesEmail) {
        return { allowed: false, reason: 'OPTED_OUT' };
      }
    }

    // 4. MARKETING — sprawdź preferences. TRANSACTIONAL przechodzi zawsze.
    if (category === 'MARKETING') {
      // Brak preferences = treat as opt-out (privacy-by-default).
      if (!user || !user.marketingPreferences) {
        return { allowed: false, reason: 'OPTED_OUT' };
      }
      const prefs = user.marketingPreferences;
      // `productUpdatesEmail` traktujemy jako alternatywny opt-in dla
      // newsletterów typu "co nowego". Dla generic newslettera używamy
      // `marketingEmail`. Konkretną klasyfikację robi caller (campaign segment).
      if (!prefs.marketingEmail && !prefs.productUpdatesEmail) {
        return { allowed: false, reason: 'OPTED_OUT' };
      }
    }

    return { allowed: true };
  }

  private async applyFromOverrides(message: MailMessage): Promise<MailMessage> {
    let fromAddress = message.fromAddress;
    const fromName = message.fromName ?? this.config.fromName;

    if (message.fromRole) {
      const role = message.fromRole as ControlPlaneSystemAddressRole;
      const row = await this.prisma.controlPlaneSystemAddress.findUnique({
        where: { role },
      });
      if (row) fromAddress = row.email;
    }

    if (!fromAddress) return message;
    return { ...message, fromAddress, fromName };
  }

  private async enrichForCategory(
    message: MailMessage,
    category: EmailCategory,
  ): Promise<MailMessage> {
    if (category !== 'MARKETING') return message;
    if (message.listUnsubscribeUrl) return message;

    // Wyciągnij token unsubscribe — jeśli mamy userId.
    const userId = message.userId;
    if (!userId) return message;

    const prefs = await this.prisma.marketingPreferences.findUnique({
      where: { userId },
      select: { unsubscribeToken: true },
    });
    if (!prefs?.unsubscribeToken) return message;

    const apiBaseUrl =
      this.cfg.get<string>('PUBLIC_API_URL') ??
      this.cfg.get<string>('API_BASE_URL') ??
      'https://api.verris.pl';
    const url = `${apiBaseUrl}/unsubscribe?token=${encodeURIComponent(prefs.unsubscribeToken)}`;
    return { ...message, listUnsubscribeUrl: url };
  }

  // ---------------------------------------------------------------------------
  // EmailLog persistence helpers
  // ---------------------------------------------------------------------------

  private async resolveUserId(message: MailMessage): Promise<string | null> {
    if (message.userId) return message.userId;
    const u = await this.prisma.user.findUnique({
      where: { email: message.to },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  private async persistQueued(
    message: MailMessage,
    category: EmailCategory,
  ): Promise<{ id: string } | null> {
    try {
      const userId = await this.resolveUserId(message);
      const row = await this.prisma.emailLog.create({
        data: {
          toEmail: message.to,
          userId,
          category,
          tag: message.tag ?? null,
          subject: message.subject.slice(0, 512),
          status: EmailStatus.QUEUED,
          campaignId: message.campaignId ?? null,
          metadata: this.buildMetadata(message),
        },
        select: { id: true },
      });
      return row;
    } catch (err) {
      this.logger.warn(`EmailLog persist (queued) failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async persistSuppressed(
    message: MailMessage,
    category: EmailCategory,
    reason: 'OPTED_OUT' | 'ANONYMIZED' | 'NO_RECIPIENT',
  ): Promise<{ id: string } | null> {
    try {
      const userId = await this.resolveUserId(message);
      return await this.prisma.emailLog.create({
        data: {
          toEmail: message.to || '(missing)',
          userId,
          category,
          tag: message.tag ?? null,
          subject: message.subject.slice(0, 512),
          status: EmailStatus.SUPPRESSED,
          providerId: this.provider.id,
          campaignId: message.campaignId ?? null,
          metadata: { ...this.buildMetadata(message), suppressedReason: reason },
        },
        select: { id: true },
      });
    } catch (err) {
      this.logger.warn(`EmailLog persist (suppressed) failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async markSent(
    logId: string | null,
    providerId: string,
    messageId: string | null,
  ): Promise<void> {
    if (!logId) return;
    try {
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: {
          status: EmailStatus.SENT,
          providerId,
          messageId,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`EmailLog markSent failed: ${(err as Error).message}`);
    }
  }

  private async markFailed(logId: string | null, errorMessage: string): Promise<void> {
    if (!logId) return;
    try {
      await this.prisma.emailLog.update({
        where: { id: logId },
        data: {
          status: EmailStatus.FAILED,
          providerId: this.provider.id,
          errorMessage: errorMessage.slice(0, 1024),
        },
      });
    } catch (err) {
      this.logger.warn(`EmailLog markFailed failed: ${(err as Error).message}`);
    }
  }

  private buildMetadata(message: MailMessage): Prisma.JsonObject {
    const meta: Prisma.JsonObject = {};
    if (message.replyTo) meta.replyTo = message.replyTo;
    if (message.listUnsubscribeUrl) meta.listUnsubscribeUrl = message.listUnsubscribeUrl;
    return meta;
  }
}

export function buildMailerProvider(config: ConfigService): MailerProvider {
  const host = config.get<string>('SMTP_HOST') || process.env.SMTP_HOST || 'localhost';
  const port = parseInt(config.get<string>('SMTP_PORT') || process.env.SMTP_PORT || '25', 10);
  const username = config.get<string>('SMTP_USER') || process.env.SMTP_USER || '';
  const password = config.get<string>('SMTP_PASS') || process.env.SMTP_PASS || '';
  const fromAddress =
    config.get<string>('SMTP_FROM_ADDRESS') || process.env.SMTP_FROM_ADDRESS || 'panel@verris.pl';
  const fromName =
    config.get<string>('SMTP_FROM_NAME') || process.env.SMTP_FROM_NAME || 'Verris';

  const secureRaw = (config.get<string>('SMTP_SECURE') || process.env.SMTP_SECURE || '').toLowerCase();
  const local = isLocalSmtpHost(host);
  const secure: MailSmtpSecure =
    secureRaw === 'tls'
      ? 'tls'
      : secureRaw === 'none'
        ? 'none'
        : secureRaw === 'starttls'
          ? 'starttls'
          : local
            ? 'none'
            : 'starttls';

  return buildSmtpMailerProvider({
    host,
    port: Number.isFinite(port) && port > 0 ? port : local ? 25 : 587,
    username,
    password,
    fromAddress,
    fromName,
    secure,
  });
}
