/**
 * E-3: minimal mailer abstraction. We keep it deliberately small so we can
 * swap providers (Resend / Postmark / SES / raw SMTP) without touching every
 * caller. Templates are pure functions returning `MailMessage`; they live
 * next to their use sites (e.g. `tickets/email-templates.ts`).
 */
/**
 * High-level klasyfikacja maila — używana do:
 *   - filtrowania opt-out (`MARKETING` szanuje `MarketingPreferences`),
 *   - rate-limitów per kategoria (Postfix throttling profile),
 *   - separacji w EmailLog (admin viewer w Sprint 2.7).
 *
 * Domyślnie zakładamy `TRANSACTIONAL` jeśli nie podano — błędne wysłanie
 * marketingu jako transactional jest zauważalne w audycie i można naprawić.
 * Odwrotny błąd (transactional jako marketing) prowadziłby do nieświadomego
 * suppressowania krytycznych powiadomień, dlatego ten "fail-safe" default.
 */
export type EmailCategory = 'TRANSACTIONAL' | 'MARKETING' | 'PRODUCT_UPDATE';

/** Nadawca z rejestru MAIL-4 (`ControlPlaneSystemAddress`). */
export type SystemFromRole =
  | 'NOREPLY'
  | 'SUPPORT'
  | 'SECURITY'
  | 'RODO'
  | 'BILLING'
  | 'DMARC_RUA'
  | 'PANEL';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body — REQUIRED, every template must provide one. */
  text: string;
  /** Optional rich HTML body. */
  html?: string;
  /** Optional `Reply-To` header (e.g. ticket address). */
  replyTo?: string;
  /** Envelope/header From — nadpisuje domyślny SMTP_FROM z ustawień panelu. */
  fromAddress?: string;
  fromName?: string;
  /** From z tabeli adresów systemowych (MAIL-4); wygrywa z `fromAddress` gdy oba podane. */
  fromRole?: SystemFromRole;
  /** Tag/category for analytics (Resend's `tags`, Postmark's `Tag`). */
  tag?: string;
  /**
   * Klasyfikacja anty-spam / RODO. `MARKETING` jest filtrowany przez
   * `MarketingPreferences`. Domyślnie `TRANSACTIONAL`.
   */
  category?: EmailCategory;
  /**
   * Powiązany `User.id` jeśli odbiorca jest zarejestrowany. Mailer wykorzysta
   * to do:
   *   - sprawdzenia preferences/anonimizacji,
   *   - wpisania do EmailLog z FK,
   *   - wstrzyknięcia `List-Unsubscribe` headera dla MARKETING.
   */
  userId?: string;
  /**
   * Powiązanie z `MarketingCampaign.id` jeśli mail wynika z kampanii.
   */
  campaignId?: string;
  /**
   * RFC 2369 / 8058 List-Unsubscribe headers — generowane automatycznie
   * przez mailer dla `MARKETING`, ale provider może je nadpisać (np. dla
   * specjalnych sytuacji). Jeśli puste — mailer zbuduje na podstawie
   * `MarketingPreferences.unsubscribeToken`.
   */
  listUnsubscribeUrl?: string;
}

export interface MailerProvider {
  /** Returns a stable identifier (e.g. `log`, `smtp`, `resend`) for audit. */
  readonly id: string;
  send(message: MailMessage): Promise<{ providerId: string; messageId: string | null }>;
}
