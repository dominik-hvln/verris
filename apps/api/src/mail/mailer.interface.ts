/**
 * E-3: minimal mailer abstraction. We keep it deliberately small so we can
 * swap providers (Resend / Postmark / SES / raw SMTP) without touching every
 * caller. Templates are pure functions returning `MailMessage`; they live
 * next to their use sites (e.g. `tickets/email-templates.ts`).
 */
export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body — REQUIRED, every template must provide one. */
  text: string;
  /** Optional rich HTML body. */
  html?: string;
  /** Optional `Reply-To` header (e.g. ticket address). */
  replyTo?: string;
  /** Tag/category for analytics (Resend's `tags`, Postmark's `Tag`). */
  tag?: string;
}

export interface MailerProvider {
  /** Returns a stable identifier (e.g. `log`, `smtp`, `resend`) for audit. */
  readonly id: string;
  send(message: MailMessage): Promise<{ providerId: string; messageId: string | null }>;
}
